"""
Precompute cotton-field polygons for the dashboard.

Mirrors the unsupervised pipeline in skills.py (AlphaEarth embeddings ->
k-means over cropland -> cotton cluster picked by NDVI phenology), then
vectorizes the resulting cotton mask into discrete field polygons that the
dashboard map can display and let the user click.

Run once (or whenever CONFIG / COTTON_CLUSTERS changes):
    venv/Scripts/python.exe precompute_cotton.py
Output:
    static/data/cotton_polygons.geojson
    static/data/district.geojson
"""
import json
import os

import ee
from dotenv import load_dotenv

load_dotenv()
ee.Initialize(project=os.environ["EE_PROJECT"])

# ===== Same config as skills.py =====
CONFIG = {
    "YEAR": 2023,
    "N_CLUSTERS": 20,
    "N_TRAIN_PIXELS": 5000,
    "CLEAR_THRESHOLD": 0.60,
    "SEED": 42,
}
COTTON_CLUSTERS = [10]
DISTRICT = "Sanghar"

# Minimum mapping unit for vectorized fields, to remove pixel-level speckle.
MMU_SCALE = 30          # meters, used for both smoothing and vectorizing
MIN_CONNECTED_PIXELS = 6  # ~0.5 ha at 30m
MIN_AREA_HA = 3.0         # drop slivers after vectorizing
SIMPLIFY_M = 15            # simplify polygon boundaries for a lighter GeoJSON
MAX_POLYGONS = 400         # cap for a responsive dashboard; keep the largest fields

OUT_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
os.makedirs(OUT_DIR, exist_ok=True)


def _ring_centroid(ring):
    """Area-weighted centroid of a polygon ring (list of [lon, lat])."""
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
    """Real (lat, lon) centroid of a Polygon/MultiPolygon GeoJSON geometry."""
    if geometry["type"] == "Polygon":
        lon, lat = _ring_centroid(geometry["coordinates"][0])
        return lat, lon
    if geometry["type"] == "MultiPolygon":
        best = max(geometry["coordinates"], key=lambda poly: abs(_signed_area(poly[0])))
        lon, lat = _ring_centroid(best[0])
        return lat, lon
    raise ValueError(f"Unsupported geometry type: {geometry['type']}")


def main():
    pak = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(
        ee.Filter.eq("ADM0_NAME", "Pakistan")
    )
    sindh = pak.filter(ee.Filter.stringContains("ADM1_NAME", "Sind"))
    districts = sindh.filter(ee.Filter.stringContains("ADM2_NAME", DISTRICT))
    print("Matched district(s):", districts.aggregate_array("ADM2_NAME").getInfo())

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

    print("Training k-means clusterer...")
    training = aef_crop.sample(
        region=aoi,
        scale=10,
        numPixels=CONFIG["N_TRAIN_PIXELS"],
        seed=CONFIG["SEED"],
        geometries=False,
    )
    clusterer = ee.Clusterer.wekaKMeans(CONFIG["N_CLUSTERS"]).train(training)
    clusters = aef_crop.cluster(clusterer).rename("cluster").clip(aoi)

    cotton = ee.Image(0)
    for cid in COTTON_CLUSTERS:
        cotton = cotton.Or(clusters.eq(cid))
    cotton = cotton.updateMask(crop_mask).rename("cotton")

    # Remove speckle: keep only patches with enough connected pixels at MMU_SCALE.
    print("Removing sub-MMU speckle and vectorizing (this can take a few minutes)...")
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
        tileScale=16,
    )

    vectors = vectors.map(
        lambda f: f.set(
            "area_ha", f.geometry().area(1).divide(10000)
        ).simplify(SIMPLIFY_M)
    ).filter(ee.Filter.gte("area_ha", MIN_AREA_HA))

    n_total = vectors.size().getInfo()
    vectors = ee.FeatureCollection(vectors.sort("area_ha", False).toList(MAX_POLYGONS))
    n = vectors.size().getInfo()
    print(
        f"{n_total} cotton field polygons >= {MIN_AREA_HA} ha; "
        f"keeping the largest {n} for the dashboard."
    )

    fc = vectors.getInfo()
    # Assign a stable integer id per feature for the dashboard API, and a
    # real centroid so the dashboard can show where the selected field is.
    for i, feat in enumerate(fc["features"]):
        lat, lon = feature_centroid(feat["geometry"])
        feat["id"] = i
        feat["properties"] = {
            "id": i,
            "area_ha": round(feat["properties"].get("area_ha", 0), 2),
            "cluster": COTTON_CLUSTERS[0],
            "district": DISTRICT,
            "centroid_lat": round(lat, 5),
            "centroid_lon": round(lon, 5),
        }

    out_path = os.path.join(OUT_DIR, "cotton_polygons.geojson")
    with open(out_path, "w") as f:
        json.dump(fc, f)
    print("Wrote", out_path)

    district_geojson = districts.select(["ADM2_NAME"]).getInfo()
    with open(os.path.join(OUT_DIR, "district.geojson"), "w") as f:
        json.dump(district_geojson, f)
    print("Wrote district.geojson")


if __name__ == "__main__":
    main()
