"""
Precompute per-field climate stats and NDVI for all years (2018-2026).

Generates static JSON files that the GitHub Pages frontend can load
without a live Earth Engine backend.

Output:
    static/data/field_stats_{year}.json   — climate stats for every field
    static/data/field_ndvi_{year}.json    — NDVI + percentile for every field
"""
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import ee
from dotenv import load_dotenv

load_dotenv()
ee.Initialize(project=os.environ["EE_PROJECT"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
os.makedirs(DATA_DIR, exist_ok=True)

YEARS = list(range(2018, 2027))
BATCH_SIZE = 30


def load_polygons():
    path = os.path.join(DATA_DIR, "cotton_polygons.geojson")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def compute_climate_for_fields(ee_fc, year):
    """Compute climate stats for a batch of fields (mirrors ee_climate.compute_stats)."""
    import math

    today = __import__("datetime").date.today()
    FULL_SEASON_MONTHS = list(range(4, 12))

    if year > today.year:
        return {}
    if year < today.year:
        months = FULL_SEASON_MONTHS
    else:
        months = [m for m in FULL_SEASON_MONTHS if m <= today.month]

    if not months:
        return {}

    POINT_SCALE = 30
    season_start = ee.Date.fromYMD(year, months[0], 1)
    season_end = ee.Date.fromYMD(year, months[-1], 1).advance(1, "month")
    if year == today.year:
        season_end = ee.Date.fromYMD(today.year, today.month, today.day)

    era5 = (
        ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
        .filterDate(season_start, season_end)
        .filterBounds(ee_fc)
    )
    chirps = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterDate(season_start, season_end)
        .filterBounds(ee_fc)
    )
    modis = (
        ee.ImageCollection("MODIS/061/MOD11A2")
        .filterDate(season_start, season_end)
        .filterBounds(ee_fc)
    )

    t_mean = era5.select("temperature_2m").mean().subtract(273.15)
    t_max = era5.select("temperature_2m_max").max().subtract(273.15)
    t_min = era5.select("temperature_2m_min").min().subtract(273.15)
    dewpoint = era5.select("dewpoint_temperature_2m").mean().subtract(273.15)
    era5_precip = era5.select("total_precipitation_sum").sum().multiply(1000)
    chirps_precip = chirps.select("precipitation").sum()
    lst_day = modis.select("LST_Day_1km").mean().multiply(0.02).subtract(273.15)
    lst_night = modis.select("LST_Night_1km").mean().multiply(0.02).subtract(273.15)
    lst_day_max = modis.select("LST_Day_1km").max().multiply(0.02).subtract(273.15)

    seasonal_img = ee.Image.cat([
        t_mean.rename("t_mean_c"),
        t_max.rename("t_max_c"),
        t_min.rename("t_min_c"),
        dewpoint.rename("dewpoint_c"),
        era5_precip.rename("era5_precip_mm"),
        chirps_precip.rename("chirps_precip_mm"),
        lst_day.rename("lst_day_c"),
        lst_night.rename("lst_night_c"),
        lst_day_max.rename("lst_day_max_c"),
    ])

    reduced = seasonal_img.reduceRegions(
        collection=ee_fc,
        reducer=ee.Reducer.mean(),
        scale=POINT_SCALE,
        bestEffort=True,
        maxPixels=1e9,
        tileScale=4,
    ).getInfo()

    results = {}
    for feat in reduced["features"]:
        p = feat["properties"]
        fid = p.get("id")
        if fid is None:
            continue
        t_mean_v = p.get("t_mean_c")
        dewpoint_v = p.get("dewpoint_c")
        rh = None
        if t_mean_v is not None and dewpoint_v is not None:
            def es(t):
                return 6.1094 * math.exp((17.625 * t) / (t + 243.04))
            rh = max(0.0, min(100.0, 100.0 * (es(dewpoint_v) / es(t_mean_v))))

        month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                       "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        season_label = f"Apr-{month_names[months[-1]]} {year}"
        if year == today.year:
            season_label += f" (in progress, through {today.isoformat()})"

        results[fid] = {
            "year": year,
            "season": season_label,
            "in_progress": year == today.year,
            "no_data": False,
            "temperature": {
                "mean_c": t_mean_v,
                "max_c": p.get("t_max_c"),
                "min_c": p.get("t_min_c"),
            },
            "relative_humidity_pct": rh,
            "rainfall": {
                "chirps_total_mm": p.get("chirps_precip_mm"),
                "era5_total_mm": p.get("era5_precip_mm"),
            },
            "lst": {
                "day_mean_c": p.get("lst_day_c"),
                "day_max_c": p.get("lst_day_max_c"),
                "night_mean_c": p.get("lst_night_c"),
            },
            "monthly": [],
            "sources": {
                "temperature_humidity_rainfall_era5": "ECMWF/ERA5_LAND/DAILY_AGGR",
                "rainfall_chirps": "UCSB-CHG/CHIRPS/DAILY",
                "lst": "MODIS/061/MOD11A2",
            },
        }

    return results


def compute_ndvi_for_fields(ee_fc, year):
    """Compute NDVI for all fields (mirrors ndvi_yield.compute_ndvi_for_all_fields)."""
    today = __import__("datetime").date.today()
    start = __import__("datetime").date(year, 8, 1)
    full_end = __import__("datetime").date(year, 10, 1)

    if year > today.year or (year == today.year and today < start):
        return {}, False, None, None

    if year == today.year and today < full_end:
        end = today + __import__("datetime").timedelta(days=1)
        in_progress = True
    else:
        end = full_end
        in_progress = False

    CS_BAND = "cs_cdf"
    CLEAR_THRESHOLD = 0.60
    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    csp = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")

    def mask_s2(img):
        scaled = img.select(["B4", "B8"]).multiply(0.0001)
        clear = img.select(CS_BAND).gte(CLEAR_THRESHOLD)
        return scaled.updateMask(clear).copyProperties(img, ["system:time_start"])

    feature_list = ee_fc.toList(ee_fc.size()).getInfo()
    values = {}

    for i in range(0, len(feature_list), BATCH_SIZE):
        batch = feature_list[i : i + BATCH_SIZE]
        batch_fc = ee.FeatureCollection([
            ee.Feature(ee.Geometry(f["geometry"]), f["properties"]) for f in batch
        ])
        col = (
            s2.filterBounds(batch_fc)
            .filterDate(start.isoformat(), end.isoformat())
            .linkCollection(csp, [CS_BAND])
            .map(mask_s2)
        )
        ndvi_img = col.median().normalizedDifference(["B8", "B4"]).rename("ndvi")
        reduced = ndvi_img.reduceRegions(
            collection=batch_fc,
            reducer=ee.Reducer.mean(),
            scale=20,
            tileScale=4,
        ).getInfo()
        for feat in reduced["features"]:
            p = feat["properties"]
            values[p["id"]] = p.get("ndvi", p.get("mean"))

    return values, in_progress, start.isoformat(), end.isoformat()


def main():
    fc = load_polygons()
    features = fc["features"]
    print(f"Loaded {len(features)} cotton field polygons")

    for year in YEARS:
        print(f"\n=== Year {year} ===")

        ee_features = [
            ee.Feature(ee.Geometry(feat["geometry"]), {"id": feat["properties"]["id"]})
            for feat in features
        ]
        ee_fc = ee.FeatureCollection(ee_features)

        # Climate stats
        print(f"  Computing climate stats for {len(features)} fields...")
        climate = {}
        for i in range(0, len(features), BATCH_SIZE):
            batch_feats = features[i : i + BATCH_SIZE]
            batch_fc = ee.FeatureCollection([
                ee.Feature(ee.Geometry(f["geometry"]), {"id": f["properties"]["id"]})
                for f in batch_feats
            ])
            batch_climate = compute_climate_for_fields(batch_fc, year)
            climate.update(batch_climate)
            print(f"    Batch {i // BATCH_SIZE + 1}: {len(batch_climate)} fields done")

        climate_path = os.path.join(DATA_DIR, f"field_stats_{year}.json")
        with open(climate_path, "w", encoding="utf-8") as f:
            json.dump(climate, f)
        print(f"  Wrote {climate_path} ({len(climate)} fields)")

        # NDVI
        print(f"  Computing NDVI for {len(features)} fields...")
        ndvi_values, in_progress, start_str, end_str = compute_ndvi_for_fields(ee_fc, year)

        ndvi_data = {
            "values": {str(k): v for k, v in ndvi_values.items()},
            "in_progress": in_progress,
            "window": f"{start_str} to {end_str}" if start_str else None,
        }
        ndvi_path = os.path.join(DATA_DIR, f"field_ndvi_{year}.json")
        with open(ndvi_path, "w", encoding="utf-8") as f:
            json.dump(ndvi_data, f)
        print(f"  Wrote {ndvi_path} ({len(ndvi_values)} fields)")

    print("\nDone! All field data precomputed.")


if __name__ == "__main__":
    main()
