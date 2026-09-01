"""
In-season NDVI proxy for cotton fields, from Sentinel-2 (Google Earth Engine).

This is deliberately a *relative NDVI index*, not a calibrated absolute yield
number: converting NDVI to kg/ha requires region-specific coefficients fitted
against real ground-truth yield samples, which we don't have for Sindh
cotton. Reporting a made-up kg/ha figure under a confident label would look
more authoritative than it is, so instead we report the field's real
peak-season NDVI plus its percentile rank against every other mapped field —
both computed live from the same Sentinel-2 imagery used in skills.py.

Aug 1 - Sep 30 (boll formation) is used as the peak window, matching the
phenology notes in skills.py ("PEAK Aug-Sep").
"""
import datetime

import ee

CS_BAND = "cs_cdf"
CLEAR_THRESHOLD = 0.60


def boll_window_for_year(year, today=None):
    """(start, end, in_progress) dates for the Aug-Sep boll-formation window,
    clamped to today. Returns (None, None, False) if the window hasn't
    started yet for `year`."""
    today = today or datetime.date.today()
    start = datetime.date(year, 8, 1)
    full_end = datetime.date(year, 10, 1)  # exclusive

    if year > today.year or (year == today.year and today < start):
        return None, None, False
    if year == today.year and today < full_end:
        return start, today + datetime.timedelta(days=1), True
    return start, full_end, False


def _mask_s2(img):
    scaled = img.select(["B4", "B8"]).multiply(0.0001)
    clear = img.select(CS_BAND).gte(CLEAR_THRESHOLD)
    return scaled.updateMask(clear).copyProperties(img, ["system:time_start"])


def compute_ndvi_for_all_fields(ee_fc, year, today=None, batch_size=50):
    """Batch-computes mean peak-window NDVI for every feature in `ee_fc`
    (each feature must carry an 'id' property) across Earth Engine. Returns
    ({id: ndvi_or_None}, in_progress, start_iso, end_iso).

    Features are sent in batches of ``batch_size`` to stay under the EE API's
    10 MB request payload limit.
    """
    start, end, in_progress = boll_window_for_year(year, today)
    if start is None:
        return {}, in_progress, None, None

    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    csp = ee.ImageCollection("GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")

    # Split features into batches so individual requests stay under 10 MB.
    feature_list = ee_fc.toList(ee_fc.size()).getInfo()
    values = {}
    for i in range(0, len(feature_list), batch_size):
        batch = feature_list[i : i + batch_size]
        batch_fc = ee.FeatureCollection([
            ee.Feature(ee.Geometry(f["geometry"]), f["properties"]) for f in batch
        ])
        col = (
            s2.filterBounds(batch_fc)
            .filterDate(start.isoformat(), end.isoformat())
            .linkCollection(csp, [CS_BAND])
            .map(_mask_s2)
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


def percentile_rank(value, all_values):
    non_null = [v for v in all_values if v is not None]
    if value is None or not non_null:
        return None
    return 100.0 * sum(1 for v in non_null if v <= value) / len(non_null)
