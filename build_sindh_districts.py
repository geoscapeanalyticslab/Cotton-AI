"""
Build Sindh Districts GeoJSON and district-level agricultural statistics.

Unlike the previous version, this pulls REAL numbers wherever possible:
  - Cropland area: live reduceRegion sum over ESA WorldCover v200 (Class 40)
  - Cotton fields / cotton area: aggregated from cotton_polygons.geojson,
    which is itself produced by the phenology-verified k-means pipeline in
    precompute_sindh_polygons_gee_fixed.py (run that FIRST).
  - Yield: real published PCCC/PBS figure via yield_data.py.

Only ONE year (REAL_DATA_YEAR, matching CONFIG["YEAR"] in the polygon
script) has actual satellite-derived cotton numbers. Every other year in
the 2018-2026 series is explicitly labeled "modeled_estimate" and scaled
off that one measured year using YEAR_FACTORS — it is NOT independently
classified per year. Do not present modeled years as satellite-derived in
the UI; use the "status"/"source" fields already in the output to show
that distinction to the user.

Districts where the polygon script found no confident cotton cluster
(e.g. Dadu, in your recent run) will correctly show 0 cotton fields here,
instead of the fabricated baseline numbers from the old version.

Outputs:
  1. static/data/sindh_districts.geojson
  2. static/data/sindh_district_stats.json
"""
import json
import os

import ee
from dotenv import load_dotenv

from yield_data import get_district_yield

load_dotenv()
try:
    ee.Initialize(project=os.environ.get("EE_PROJECT", "ee-cotton-ai"))
except Exception as e:
    print("GEE Init note:", e)

OUT_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
os.makedirs(OUT_DIR, exist_ok=True)

# Must match CONFIG["YEAR"] used to generate cotton_polygons.geojson.
REAL_DATA_YEAR = 2023

DISTRICT_NAME_MAP = {
    "Sanghar District": "Sanghar",
    "Khairpur District": "Khairpur",
    "Ghotki District": "Ghotki",
    "Mirpur Khas District": "Mirpur Khas",
    "Nawabshah District": "Shaheed Benazirabad",
    "Naushahro Feroze District": "Naushahro Feroze",
    "Badin District": "Badin",
    "Dadu District": "Dadu",
    "Sukkur District": "Sukkur",
    "Larkana District": "Larkana",
    "Hyderabad District": "Hyderabad",
    "Shikarpur District": "Shikarpur",
    "Jacobabad District": "Jacobabad",
    "Tharparkar District": "Tharparkar",
    "Thatta District": "Thatta",
    "Umer Kot District": "Umerkot",
    "Malir District": "Malir (Karachi)",
    "Karachi Central District": "Karachi Central",
    "Karachi East District": "Karachi East",
    "Karachi South District": "Karachi South",
    "Karachi West District": "Karachi West",
}

YEARS = list(range(2018, 2027))

# Used ONLY to scale the one real measured year into a rough historical
# trend. This is a modeling assumption (flood years, recovery, etc.), not
# a per-year classification. Label it as such in the UI.
YEAR_FACTORS = {
    2018: {"cotton_factor": 1.00, "yield_factor": 1.00},
    2019: {"cotton_factor": 1.03, "yield_factor": 1.02},
    2020: {"cotton_factor": 0.96, "yield_factor": 0.94},
    2021: {"cotton_factor": 0.98, "yield_factor": 0.99},
    2022: {"cotton_factor": 0.62, "yield_factor": 0.58},  # 2022 floods
    2023: {"cotton_factor": 1.00, "yield_factor": 1.00},  # anchor year, overwritten by real data
    2024: {"cotton_factor": 0.94, "yield_factor": 0.93},
    2025: {"cotton_factor": 0.97, "yield_factor": 0.96},
    2026: {"cotton_factor": 1.01, "yield_factor": 0.98},
}


def fetch_sindh_districts_geojson():
    pak = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
        ee.Filter.eq("ADM0_NAME", "Pakistan")
    )
    sindh = pak.filter(ee.Filter.stringContains("ADM1_NAME", "Sind"))
    fc = sindh.getInfo()

    for feat in fc["features"]:
        raw_name = feat["properties"].get("ADM2_NAME", "")
        std_name = DISTRICT_NAME_MAP.get(raw_name, raw_name.replace(" District", ""))
        feat["properties"]["district_name"] = std_name
        feat["properties"]["name"] = std_name
        feat["properties"]["province"] = "Sindh"

    return fc


def compute_real_cropland_ha(geometry, scale=100):
    """Live sum of ESA WorldCover cropland (class 40) pixel area inside a
    district boundary. This is the actual measured cropland extent.

    scale=100m (not WorldCover's native 10m) keeps this fast enough to
    finish within GEE's synchronous compute time limit for large districts
    — the area total from a coarser resample is still accurate to a
    fraction of a percent for a district-wide sum. bestEffort=True lets
    GEE auto-coarsen further rather than hard-failing on huge districts.
    """
    aoi = ee.Geometry(geometry)
    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").clip(aoi)
    crop_mask = worldcover.eq(40).selfMask()
    area_img = crop_mask.multiply(ee.Image.pixelArea()).divide(10000).rename("cropland_ha")
    result = area_img.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=aoi,
        scale=scale,
        maxPixels=1e13,
        tileScale=8,
        bestEffort=True,
    ).getInfo()
    return round((result.get("cropland_ha") or 0), 1)


def load_cotton_polygon_summary():
    """Group cotton_polygons.geojson features by district: field count + total area.
    Districts absent here (no confident cotton cluster) correctly get zeros below,
    rather than a fabricated number."""
    path = os.path.join(OUT_DIR, "cotton_polygons.geojson")
    summary = {}
    if not os.path.exists(path):
        print("WARNING: cotton_polygons.geojson not found — run the polygon "
              "precompute script first. All districts will show 0 cotton fields.")
        return summary
    with open(path) as f:
        fc = json.load(f)
    for feat in fc["features"]:
        d = feat["properties"].get("district")
        if not d:
            continue
        area = feat["properties"].get("area_ha", 0) or 0
        s = summary.setdefault(d, {"fields": 0, "area_ha": 0.0})
        s["fields"] += 1
        s["area_ha"] += area
    for d in summary:
        summary[d]["area_ha"] = round(summary[d]["area_ha"], 1)
    return summary


def generate_district_stats(districts_geojson):
    cotton_summary = load_cotton_polygon_summary()
    stats_map = {}

    for feat in districts_geojson["features"]:
        d_name = feat["properties"]["district_name"]
        print(f"Computing real cropland area for {d_name}...")
        cropland_ha = compute_real_cropland_ha(feat["geometry"])

        cotton = cotton_summary.get(d_name, {"fields": 0, "area_ha": 0.0})
        cotton_pct = round(100 * cotton["area_ha"] / cropland_ha, 1) if cropland_ha > 0 else 0.0

        yield_info = get_district_yield(d_name)

        cotton_source = (
            "GEE AlphaEarth unsupervised k-means, phenology-verified"
            if cotton["fields"] > 0
            else "No confident cotton cluster identified for this district in "
                 f"{REAL_DATA_YEAR} — reported as zero, not estimated"
        )

        real_entry = {
            "year": REAL_DATA_YEAR,
            "total_agri_area_ha": cropland_ha,
            "cotton_fields": cotton["fields"],
            "cotton_area_ha": cotton["area_ha"],
            "cotton_pct": cotton_pct,
            "yield_kg_ha": yield_info["value"],
            "status": "measured",
            "source": {
                "cropland": "ESA WorldCover v200 (Class 40), live area sum",
                "cotton": cotton_source,
                "yield": yield_info["source"],
            },
        }

        yearly_stats = []
        for yr in YEARS:
            if yr == REAL_DATA_YEAR:
                yearly_stats.append(real_entry)
                continue
            yf = YEAR_FACTORS.get(yr, {"cotton_factor": 1.0, "yield_factor": 1.0})
            modeled_area = round(cotton["area_ha"] * yf["cotton_factor"], 1)
            modeled_fields = int(cotton["fields"] * yf["cotton_factor"])
            modeled_yield = (
                round(yield_info["value"] * yf["yield_factor"], 1)
                if yield_info["value"] is not None else None
            )
            yearly_stats.append({
                "year": yr,
                "total_agri_area_ha": cropland_ha,
                "cotton_fields": modeled_fields,
                "cotton_area_ha": modeled_area,
                "cotton_pct": round(100 * modeled_area / cropland_ha, 1) if cropland_ha > 0 else 0.0,
                "yield_kg_ha": modeled_yield,
                "status": "modeled_estimate",
                "source": {
                    "cropland": "ESA WorldCover v200 (Class 40), live area sum",
                    "cotton": f"Modeled trend scaled from {REAL_DATA_YEAR} measured data — "
                              "not independently classified for this year",
                    "yield": "Modeled trend, not a PCCC/PBS published figure for this year",
                },
            })

        yearly_stats.sort(key=lambda y: y["year"])

        feat["properties"]["total_agri_area_ha"] = cropland_ha
        feat["properties"][f"cotton_fields_{REAL_DATA_YEAR}"] = cotton["fields"]
        feat["properties"][f"cotton_pct_{REAL_DATA_YEAR}"] = cotton_pct

        stats_map[d_name] = {
            "district_name": d_name,
            "province": "Sindh",
            "total_agri_area_ha": cropland_ha,
            "measured_year": REAL_DATA_YEAR,
            "years": yearly_stats,
        }

    return stats_map


def main():
    print("Fetching Sindh districts from Earth Engine...")
    districts_geojson = fetch_sindh_districts_geojson()

    print(f"Generating district statistics (measured year: {REAL_DATA_YEAR}, "
          "other years modeled)...")
    district_stats = generate_district_stats(districts_geojson)

    districts_path = os.path.join(OUT_DIR, "sindh_districts.geojson")
    with open(districts_path, "w") as f:
        json.dump(districts_geojson, f)
    print(f"Wrote {districts_path} ({len(districts_geojson['features'])} districts)")

    with open(os.path.join(OUT_DIR, "district.geojson"), "w") as f:
        json.dump(districts_geojson, f)

    stats_path = os.path.join(OUT_DIR, "sindh_district_stats.json")
    with open(stats_path, "w") as f:
        json.dump(district_stats, f, indent=2)
    print(f"Wrote {stats_path}")

    print("Data pre-computation complete.")


if __name__ == "__main__":
    main()