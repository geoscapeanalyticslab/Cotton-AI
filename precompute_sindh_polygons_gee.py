"""
Precompute REAL Cotton Field Polygons for Sindh Districts via Earth Engine.

Fixes the bug in the previous version: COTTON_CLUSTERS was hardcoded and
reused across every district, but k-means is retrained independently per
district, so cluster IDs from Sanghar don't mean "cotton" anywhere else.

This version auto-selects the cotton cluster PER DISTRICT by scoring each
cluster's mean monthly NDVI phenology against cotton's known curve
(low Apr-May, rising Jun-Jul, peak Aug-Sep, senescence Oct-Nov).

Output:
  static/data/cotton_polygons.geojson
"""
import json
import os

import ee
import numpy as np
from dotenv import load_dotenv

load_dotenv()
ee.Initialize(project=os.environ.get("EE_PROJECT", "ee-cotton-ai"))

CONFIG = {
    "YEAR": 2023,
    "N_CLUSTERS": 20,
    "N_TRAIN_PIXELS": 5000,
    "CLEAR_THRESHOLD": 0.60,
    "SEED": 42,
}

MMU_SCALE = 30
MIN_CONNECTED_PIXELS = 6
MIN_AREA_HA = 3.0
SIMPLIFY_M = 15
MAX_POLYGONS_PER_DISTRICT = 60
MIN_PHENOLOGY_SCORE = 0.5  # below this, skip the district rather than guess

MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12]
MONTH_BANDS = [f"ndvi_{m:02d}" for m in MONTHS]
COTTON_TEMPLATE = np.array([0.15, 0.20, 0.40, 0.65, 0.90, 0.95, 0.55, 0.25, 0.15])

OUT_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
os.makedirs(OUT_DIR, exist_ok=True)

TARGET_DISTRICTS = [
    "Sanghar", "Khairpur", "Ghotki", "Mirpur Khas", "Nawabshah",
    "Naushahro Feroze", "Badin", "Dadu", "Sukkur", "Larkana",
    "Umer Kot", "Hyderabad", "Shikarpur", "Jacobabad", "Tharparkar", "Thatta",
]

DISTRICT_NAME_CLEAN = {
    "Sanghar": "Sanghar", "Khairpur": "Khairpur", "Ghotki": "Ghotki",
    "Mirpur Khas": "Mirpur Khas", "Nawabshah": "Shaheed Benazirabad",
    "Naushahro Feroze": "Naushahro Feroze", "Badin": "Badin", "Dadu": "Dadu",
    "Sukkur": "Sukkur", "Larkana": "Larkana", "Umer Kot": "Umerkot",
    "Hyderabad": "Hyderabad", "Shikarpur": "Shikarpur", "Jacobabad": "Jacobabad",
    "Tharparkar": "Tharparkar", "Thatta": "Thatta",
}


def _ring_centroid(ring):
    a_sum = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a_sum += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a_sum *= 0.5
    if abs(a_sum) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (6 * a_sum), cy / (6 * a_sum)


def _signed_area(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        total += x0 * y1 - x1 * y0
    return total * 0.5


def feature_centroid(geometry):
    if geometry["type"] == "Polygon":
        lon, lat = _ring_centroid(geometry["coordinates"][0])
        return lat, lon
    if geometry["type"] == "MultiPolygon":
        best = max(geometry["coordinates"], key=lambda poly: abs(_signed_area(poly[0])))
        lon, lat = _ring_centroid(best[0])
        return lat, lon
    raise ValueError(f"Unsupported geometry type: {geometry['type']}")


def monthly_ndvi_stack(aoi, year):
    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    cs_p = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
    cs_band = "cs_cdf"

    def mask_s2(img):
        scaled = img.select(["B4", "B8"]).multiply(0.0001)
        clear = img.select(cs_band).gte(CONFIG["CLEAR_THRESHOLD"])
        return scaled.updateMask(clear).copyProperties(img, ["system:time_start"])

    bands = []
    for m, band_name in zip(MONTHS, MONTH_BANDS):
        start = ee.Date.fromYMD(year, m, 1)
        col = (
            s2.filterBounds(aoi)
            .filterDate(start, start.advance(1, "month"))
            .linkCollection(cs_p, [cs_band])
            .map(mask_s2)
        )
        ndvi = col.median().normalizedDifference(["B8", "B4"]).rename(band_name)
        bands.append(ndvi)
    return ee.Image.cat(bands).clip(aoi)


def pick_cotton_clusters(clusters, crop_mask, aoi, year, n_clusters, seed, top_n=3):
    """Score every cluster's NDVI phenology vs. cotton's curve, in ONE
    GEE round-trip (grouped reducer) instead of one call per cluster —
    the old per-cluster loop made up to 20 synchronous .getInfo() calls
    per district, which is what was causing the timeout."""
    ndvi_stack = monthly_ndvi_stack(aoi, year)
    profile_stack = ndvi_stack.addBands(clusters).updateMask(crop_mask)

    profile_pts = profile_stack.stratifiedSample(
        numPoints=150, classBand="cluster", region=aoi, scale=30,
        seed=seed, geometries=False, tileScale=8,
    )

    selectors = MONTH_BANDS + ["cluster"]
    group_field = len(MONTH_BANDS)  # index of 'cluster' within selectors
    grouped_reducer = ee.Reducer.mean().repeat(len(MONTH_BANDS)).group(
        groupField=group_field, groupName="cluster"
    )
    print("CHECKPOINT: about to run grouped phenology reduceColumns().getInfo()...")
    result = profile_pts.reduceColumns(
        reducer=grouped_reducer, selectors=selectors
    ).getInfo()
    print("CHECKPOINT: grouped phenology call finished.")

    scored = []
    for group in result.get("groups", []):
        c = int(group["cluster"])
        means = group.get("mean")
        if not means or all(v is None for v in means):
            continue
        arr = np.array([v if v is not None else 0.0 for v in means])
        rng = arr.max() - arr.min()
        if rng < 1e-6:
            continue
        norm = (arr - arr.min()) / rng
        score = float(np.corrcoef(norm, COTTON_TEMPLATE)[0, 1])
        peak_month = MONTHS[int(np.argmax(arr))]
        if peak_month not in (8, 9):
            score -= 0.3
        scored.append((c, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    print("    all cluster scores:", [(c, round(s, 2)) for c, s in scored])
    good = [(c, s) for c, s in scored if s >= MIN_PHENOLOGY_SCORE][:top_n]
    for c, s in good:
        print(f"    cluster {c}: phenology score {s:.2f}")
    return good


def process_district(district_raw_name):
    std_name = DISTRICT_NAME_CLEAN.get(district_raw_name, district_raw_name)
    print(f"\n--- Processing {std_name} District with GEE ---")

    pak = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
        ee.Filter.eq("ADM0_NAME", "Pakistan")
    )
    sindh = pak.filter(ee.Filter.stringContains("ADM1_NAME", "Sind"))
    districts = sindh.filter(ee.Filter.stringContains("ADM2_NAME", district_raw_name))

    if districts.size().getInfo() == 0:
        print(f"Warning: District {district_raw_name} not found in GEE.")
        return []

    aoi = districts.geometry()

    embStart = ee.Date.fromYMD(CONFIG["YEAR"], 1, 1)
    aef = (
        ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL")
        .filterDate(embStart, embStart.advance(1, "year"))
        .filterBounds(aoi)
        .mosaic()
        .clip(aoi)
    )
    aef_bands = [f"A{str(i).zfill(2)}" for i in range(64)]
    aef = aef.select(aef_bands)

    worldcover = ee.ImageCollection("ESA/WorldCover/v200").first().clip(aoi)
    crop_mask = worldcover.eq(40)
    aef_crop = aef.updateMask(crop_mask)

    training = aef_crop.sample(
        region=aoi, scale=10, numPixels=CONFIG["N_TRAIN_PIXELS"],
        seed=CONFIG["SEED"], geometries=False,
    )
    clusterer = ee.Clusterer.wekaKMeans(CONFIG["N_CLUSTERS"]).train(training)
    clusters = aef_crop.cluster(clusterer).rename("cluster").clip(aoi)

    cotton_clusters = pick_cotton_clusters(
        clusters, crop_mask, aoi, CONFIG["YEAR"], CONFIG["N_CLUSTERS"], CONFIG["SEED"]
    )
    print("CHECKPOINT: cluster picking finished:", cotton_clusters)
    if not cotton_clusters:
        print(f"  !! No confident cotton cluster found for {std_name}, skipping.")
        return []

    cluster_ids = [c for c, _ in cotton_clusters]
    cotton = ee.Image(0)
    for cid in cluster_ids:
        cotton = cotton.Or(clusters.eq(cid))
    cotton = cotton.updateMask(crop_mask).rename("cotton")

    connected = cotton.selfMask().connectedPixelCount(100, True)
    cotton_clean = cotton.updateMask(connected.gte(MIN_CONNECTED_PIXELS)).selfMask()

    vectors = cotton_clean.reduceToVectors(
        geometry=aoi, scale=MMU_SCALE, geometryType="polygon", eightConnected=True,
        labelProperty="cotton", reducer=ee.Reducer.countEvery(),
        maxPixels=1e13, tileScale=16, bestEffort=True,
    )
    vectors = vectors.map(
        lambda f: f.set("area_ha", f.geometry().area(1).divide(10000)).simplify(SIMPLIFY_M)
    ).filter(ee.Filter.gte("area_ha", MIN_AREA_HA))

    vectors = ee.FeatureCollection(vectors.sort("area_ha", False).toList(MAX_POLYGONS_PER_DISTRICT))
    print("CHECKPOINT: about to call vectors.getInfo() (vectorization + fetch)...")
    fc = vectors.getInfo()
    print("CHECKPOINT: vectors.getInfo() finished, feature count:", len(fc["features"]))

    out_features = []
    for feat in fc["features"]:
        try:
            lat, lon = feature_centroid(feat["geometry"])
            feat["properties"] = {
                "area_ha": round(feat["properties"].get("area_ha", 0), 2),
                "cluster": cluster_ids[0],
                "district": std_name,
                "district_name": std_name,
                "centroid_lat": round(lat, 5),
                "centroid_lon": round(lon, 5),
            }
            out_features.append(feat)
        except Exception as err:
            print("Centroid skip:", err)

    print(f"Extracted {len(out_features)} vectorized fields for {std_name}.")
    return out_features


def main():
    all_features = []
    global_id = 0

    for d_name in TARGET_DISTRICTS:
        try:
            feats = process_district(d_name)
            for f in feats:
                f["id"] = global_id
                f["properties"]["id"] = global_id
                all_features.append(f)
                global_id += 1

            # checkpoint after every district so a crash doesn't lose earlier work
            fc = {"type": "FeatureCollection", "features": all_features}
            with open(os.path.join(OUT_DIR, "cotton_polygons.geojson"), "w") as fh:
                json.dump(fc, fh)
        except Exception as e:
            print(f"Error processing district {d_name}: {e}")

    print(f"\nWrote total {len(all_features)} GEE vectorized cotton field polygons across Sindh "
          f"to {os.path.join(OUT_DIR, 'cotton_polygons.geojson')}")


if __name__ == "__main__":
    main()