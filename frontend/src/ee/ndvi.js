/**
 * In-season NDVI proxy for cotton fields from Sentinel-2 (EE JS API).
 * Browser-side port of ndvi_yield.py.
 *
 * Uses Aug 1 – Sep 30 (boll formation) as the peak window.
 * Reports the field's peak-season NDVI + percentile rank against all mapped fields.
 */
import { getEE } from './auth';
import { evaluate, nextFrame } from './evaluate';

const CS_BAND = 'cs_cdf';
const CLEAR_THRESHOLD = 0.60;
// 600 fields in batches of 150 → 4 requests. Bigger batches mean fewer
// repeated composites; the reduce is still spread across tiles with tileScale.
const BATCH_SIZE = 150;

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
  const scaled = img.select(['B4', 'B8']).multiply(0.0001);
  const clear = img.select(CS_BAND).gte(CLEAR_THRESHOLD);
  return scaled.updateMask(clear).copyProperties(img, ['system:time_start']);
}

function toEePoint(ee, point) {
  return ee.Feature(ee.Geometry.Point([point.lon, point.lat]), { id: point.id });
}

/**
 * Compute mean peak-window NDVI for every mapped field.
 *
 * Uses the field centroids (600 points) rather than the full polygons: each
 * point samples the same 20 m Sentinel-2 grid, so the regional percentile is
 * preserved while the request payload stays tiny.
 *
 * @param {Array<{id: number, lat: number, lon: number}>} points
 * @param {number} year
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{values: object, inProgress: boolean, windowStart: string|null, windowEnd: string|null}>}
 */
export async function computeNdviForAllFields(points, year, onProgress) {
  const ee = getEE();
  const { start, end, inProgress } = bollWindowForYear(year);

  if (!start) {
    return { values: {}, inProgress: false, windowStart: null, windowEnd: null };
  }

  const items = Array.isArray(points) ? points : [];
  if (!items.length) {
    return { values: {}, inProgress: false, windowStart: null, windowEnd: null };
  }

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  // Build the composite once over every field. Each batch then only runs the
  // (cheap) zonal reduction against the same image graph.
  const allPoints = ee.FeatureCollection(items.map((p) => toEePoint(ee, p)));

  const col = ee
    .ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(allPoints)
    .filterDate(startDate, endDate)
    .linkCollection(ee.ImageCollection('GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED'), [CS_BAND])
    .map(maskS2);

  const ndviImg = col.median().normalizedDifference(['B8', 'B4']).rename('ndvi');

  const values = {};
  const total = Math.ceil(items.length / BATCH_SIZE);
  let done = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchFC = ee.FeatureCollection(batch.map((p) => toEePoint(ee, p)));

    try {
      const reduced = await evaluate(
        ndviImg.reduceRegions({
          collection: batchFC,
          reducer: ee.Reducer.mean(),
          scale: 20,
          tileScale: 8,
        })
      );

      for (const feat of reduced.features) {
        const p = feat.properties;
        values[p.id] = p.ndvi ?? p.mean ?? null;
      }
    } catch (err) {
      // Keep going: a single failed batch shouldn't discard the other 550
      // fields. The caller reports the error and falls back to precomputed
      // data for the missing fields.
      failed += 1;
      console.warn(`NDVI batch ${done + 1}/${total} failed:`, err);
    }

    done += 1;
    if (onProgress) onProgress(done, total);
    await nextFrame();
  }

  if (failed === total) {
    throw new Error('Earth Engine could not compute NDVI for this year');
  }

  return { values, inProgress, windowStart: startDate, windowEnd: endDate };
}

/**
 * Compute percentile rank of a value against all values.
 */
export function percentileRank(value, allValues) {
  const nonNull = allValues.filter((v) => v != null);
  if (value == null || !nonNull.length) return null;
  return (100.0 * nonNull.filter((v) => v <= value).length) / nonNull.length;
}
