import datetime
import json
import os

import ee
from dotenv import load_dotenv
from flask import Flask, jsonify, request

import ee_climate
import ndvi_yield
import yield_data

load_dotenv()
ee.Initialize(project=os.environ["EE_PROJECT"])

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "static", "data")

_polygons_cache = None
_stats_cache = {}
# Batch NDVI results for every field, keyed by year. Computed once per year
# per process lifetime (one Earth Engine call covers all 400 fields) —
# restart the server to pick up fresher Sentinel-2 imagery mid-season.
_ndvi_cache = {}


def load_polygons():
    global _polygons_cache
    if _polygons_cache is None:
        with open(os.path.join(DATA_DIR, "cotton_polygons.geojson")) as f:
            _polygons_cache = json.load(f)
    return _polygons_cache


def find_feature(fid):
    fc = load_polygons()
    for feat in fc["features"]:
        if feat["properties"]["id"] == fid:
            return feat
    return None


def get_ndvi_cache(year):
    if year not in _ndvi_cache:
        # Load raw GeoJSON and process in batches directly from file
        # This avoids serializing all 600 features into one GEE request
        import ndvi_yield
        fc = load_polygons()
        values = {}
        in_progress = None
        start = None
        end = None
        batch_size = 30  # Conservative batch size for 600-field dataset

        for i in range(0, len(fc["features"]), batch_size):
            batch_feats = fc["features"][i:i + batch_size]
            ee_features = [
                ee.Feature(ee.Geometry(feat["geometry"]), {"id": feat["properties"]["id"]})
                for feat in batch_feats
            ]
            ee_fc = ee.FeatureCollection(ee_features)
            b_values, b_in_progress, b_start, b_end = ndvi_yield.compute_ndvi_for_all_fields(ee_fc, year)
            values.update(b_values)
            if in_progress is None:
                in_progress = b_in_progress
                start = b_start
                end = b_end

        _ndvi_cache[year] = {
            "values": values,
            "in_progress": in_progress,
            "window": f"{start} to {end}" if start else None,
        }
    return _ndvi_cache[year]


@app.route("/api/polygons")
def api_polygons():
    return jsonify(load_polygons())


@app.route("/api/district")
@app.route("/api/districts")
def api_districts():
    path = os.path.join(DATA_DIR, "sindh_districts.geojson")
    if not os.path.exists(path):
        path = os.path.join(DATA_DIR, "district.geojson")
    with open(path) as f:
        return jsonify(json.load(f))


@app.route("/api/districts/stats")
def api_all_district_stats():
    path = os.path.join(DATA_DIR, "sindh_district_stats.json")
    if os.path.exists(path):
        with open(path) as f:
            return jsonify(json.load(f))
    return jsonify({})


@app.route("/api/district/<district_name>/stats")
def api_district_stats(district_name):
    path = os.path.join(DATA_DIR, "sindh_district_stats.json")
    if os.path.exists(path):
        with open(path) as f:
            all_stats = json.load(f)
            for key, val in all_stats.items():
                if key.lower() == district_name.lower():
                    return jsonify(val)
    return jsonify({"error": "District stats not found"}), 404


@app.route("/api/stats/<int:fid>")
def api_stats(fid):
    year = request.args.get("year", default=datetime.date.today().year, type=int)
    # The current year's season is still filling in day by day, so never
    # serve a stale cached result for it — every other year is immutable.
    cacheable = year != datetime.date.today().year
    cache_key = (fid, year)
    if cacheable and cache_key in _stats_cache:
        return jsonify(_stats_cache[cache_key])

    feature = find_feature(fid)
    if feature is None:
        return jsonify({"error": "polygon not found"}), 404

    geometry = ee.Geometry(feature["geometry"])
    stats = ee_climate.compute_stats(geometry, year)
    stats["polygon"] = feature["properties"]

    if cacheable:
        _stats_cache[cache_key] = stats
    return jsonify(stats)


@app.route("/api/yield/sindh-history")
def api_sindh_yield_history():
    return jsonify(yield_data.load_sindh_yield_history())


@app.route("/api/yield/<int:fid>")
def api_yield(fid):
    year = request.args.get("year", default=datetime.date.today().year, type=int)

    feature = find_feature(fid)
    if feature is None:
        return jsonify({"error": "polygon not found"}), 404

    district_yield = yield_data.get_district_yield(feature["properties"]["district"])

    cache = get_ndvi_cache(year)
    ndvi_val = cache["values"].get(fid)
    percentile = ndvi_yield.percentile_rank(ndvi_val, cache["values"].values())

    return jsonify({
        "year": year,
        "district_yield": district_yield,
        "ndvi_estimate": {
            "ndvi": ndvi_val,
            "percentile": percentile,
            "window": cache["window"],
            "in_progress": cache["in_progress"],
            "status": "not_started" if cache["window"] is None else "ok",
            "source": "Sentinel-2 (GEE)",
        },
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
