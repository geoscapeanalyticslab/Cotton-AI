"""
Process timed-out districts using optimized GEE tileScale and scale settings.
Target districts: Sanghar, Khairpur, Dadu, Larkana, Tharparkar, Thatta.
"""
import json
import os
import ee
from dotenv import load_dotenv

load_dotenv()
ee.Initialize(project=os.environ.get("EE_PROJECT", "ee-cotton-ai"))

CONFIG = {
    "YEAR": 2023,
    "N_CLUSTERS": 20,
    "N_TRAIN_PIXELS": 3000,
    "SEED": 42,
}
COTTON_CLUSTERS = [10, 3, 9]

MMU_SCALE = 30
MIN_CONNECTED_PIXELS = 6
MIN_AREA_HA = 3.0
SIMPLIFY_M = 15
MAX_POLYGONS_PER_DISTRICT = 60

OUT_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
POLYGONS_PATH = os.path.join(OUT_DIR, "cotton_polygons.geojson")

REMAINING_DISTRICTS = ["Sanghar", "Khairpur", "Dadu", "Larkana", "Tharparkar", "Thatta"]

DISTRICT_NAME_CLEAN = {
    "Sanghar": "Sanghar",
    "Khairpur": "Khairpur",
    "Dadu": "Dadu",
    "Larkana": "Larkana",
    "Tharparkar": "Tharparkar",
    "Thatta": "Thatta",
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


def process_district(district_raw_name):
    std_name = DISTRICT_NAME_CLEAN.get(district_raw_name, district_raw_name)
    print(f"--- Processing {std_name} with optimized tileScale=32 ---")

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
        region=aoi,
        scale=30,
        numPixels=CONFIG["N_TRAIN_PIXELS"],
        seed=CONFIG["SEED"],
        tileScale=16,
        geometries=False,
    )
    clusterer = ee.Clusterer.wekaKMeans(CONFIG["N_CLUSTERS"]).train(training)
    clusters = aef_crop.cluster(clusterer).rename("cluster").clip(aoi)

    cotton = ee.Image(0)
    for cid in COTTON_CLUSTERS:
        cotton = cotton.Or(clusters.eq(cid))
    cotton = cotton.updateMask(crop_mask).rename("cotton")

    connected = cotton.selfMask().connectedPixelCount(100, True)
    cottonClean = cotton.updateMask(connected.gte(MIN_CONNECTED_PIXELS)).selfMask()

    vectors = cottonClean.reduceToVectors(
        geometry=aoi,
        scale=MMU_SCALE,
        geometryType="polygon",
        eightConnected=True,
        labelProperty="cotton",
        reducer=ee.Reducer.countEvery(),
        maxPixels=1e10,
        tileScale=32,
    )

    vectors = vectors.map(
        lambda f: f.set("area_ha", f.geometry().area(1).divide(10000)).simplify(SIMPLIFY_M)
    ).filter(ee.Filter.gte("area_ha", MIN_AREA_HA))

    vectors = ee.FeatureCollection(vectors.sort("area_ha", False).toList(MAX_POLYGONS_PER_DISTRICT))
    fc = vectors.getInfo()

    out_features = []
    for feat in fc["features"]:
        try:
            lat, lon = feature_centroid(feat["geometry"])
            feat["properties"] = {
                "area_ha": round(feat["properties"].get("area_ha", 0), 2),
                "cluster": COTTON_CLUSTERS[0],
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
    with open(POLYGONS_PATH, "r") as f:
        data = json.load(f)

    existing_features = data.get("features", [])
    max_id = max([f["id"] for f in existing_features] + [-1])
    global_id = max_id + 1

    new_features = []
    for d_name in REMAINING_DISTRICTS:
        try:
            feats = process_district(d_name)
            for f in feats:
                f["id"] = global_id
                f["properties"]["id"] = global_id
                new_features.append(f)
                global_id += 1
        except Exception as e:
            print(f"Failed {d_name}: {e}")

    all_features = existing_features + new_features
    data["features"] = all_features

    with open(POLYGONS_PATH, "w") as f:
        json.dump(data, f)

    print(f"\nSuccessfully added {len(new_features)} new GEE fields. Total fields: {len(all_features)}")


if __name__ == "__main__":
    main()
