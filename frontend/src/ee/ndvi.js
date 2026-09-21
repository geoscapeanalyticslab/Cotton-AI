/**
 * In-season NDVI proxy for cotton fields from Sentinel-2 (EE JS API).
 * Browser-side port of ndvi_yield.py.
 *
 * Uses Aug 1 – Sep 30 (boll formation) as the peak window.
 * Reports the field's peak-season NDVI + percentile rank against all mapped fields.
 */
import { getEE } from './auth';

const CS_BAND = 'cs_cdf';
const CLEAR_THRESHOLD = 0.60;
const BATCH_SIZE = 30;

function bollWindowForYear(year) {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  const start = new Date(year, 7, 1); // Aug 1
  const fullEnd = new Date(year, 9, 1); // Oct 1 (exclusive)

  if (year > todayYear || (year === todayYear && now < start)) {
    return { start: null, end: null, inProgress: false };
  }

  if (year === todayYear && now < fullEnd) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start, end: tomorrow, inProgress: true };
  }

  return { start, end: fullEnd, inProgress: false };
}

function maskS2(img) {
  const ee = getEE();
  const scaled = img.select(['B4', 'B8']).multiply(0.0001);
  const clear = img.select(CS_BAND).gte(CLEAR_THRESHOLD);
  return scaled.updateMask(clear).copyProperties(img, ['system:time_start']);
}

/**
 * Compute mean peak-window NDVI for every field in the GeoJSON FeatureCollection.
 * Returns ({ id: ndvi_or_null }, inProgress, startIso, endIso).
 */
export async function computeNdviForAllFields(polygons, year) {
  const ee = getEE();
  const { start, end, inProgress } = bollWindowForYear(year);

  if (!start) {
    return { values: {}, inProgress: false, windowStart: null, windowEnd: null };
  }

  const s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED');
  const csp = ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED');

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const values = {};
  const features = polygons.features;

  // Process in batches to stay under EE request size limits
  for (let i = 0; i < features.length; i += BATCH_SIZE) {
    const batch = features.slice(i, i + BATCH_SIZE);
    const eeFeatures = batch.map((f) =>
      ee.Feature(ee.Geometry(f.geometry), { id: f.properties.id })
    );
    const batchFC = ee.FeatureCollection(eeFeatures);

    const col = s2
      .filterBounds(batchFC)
      .filterDate(startDate, endDate)
      .linkCollection(csp, [CS_BAND])
      .map(maskS2);

    const ndviImg = col.median().normalizedDifference(['B8', 'B4']).rename('ndvi');

    const reduced = await ndviImg.reduceRegions({
      collection: batchFC,
      reducer: ee.Reducer.mean(),
      scale: 20,
      tileScale: 4,
    }).getInfo();

    for (const feat of reduced.features) {
      const p = feat.properties;
      values[p.id] = p.ndvi ?? p.mean ?? null;
    }
  }

  return {
    values,
    inProgress,
    windowStart: startDate,
    windowEnd: endDate,
  };
}

/**
 * Compute percentile rank of a value against all values.
 */
export function percentileRank(value, allValues) {
  const nonNull = allValues.filter((v) => v != null);
  if (value == null || !nonNull.length) return null;
  return (100.0 * nonNull.filter((v) => v <= value).length) / nonNull.length;
}
