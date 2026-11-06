// api.js — hybrid mode: live EE queries → backend → precomputed static files
import { isEEReady } from './ee/auth';
import { computeStats } from './ee/climate';
import { computeNdviForAllFields, percentileRank } from './ee/ndvi';

// The Flask backend only exists when the app is served locally. On a static
// host (GitHub Pages) skip the /api probes entirely and go straight to the
// bundled JSON files.
const IS_STATIC_HOST =
  typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname);

const API_BASE = IS_STATIC_HOST ? null : '/api';
const STATIC_PREFIX = `${import.meta.env.BASE_URL}data/`;

async function apiCall(path) {
  if (!API_BASE) return null;
  try {
    const res = await fetch(API_BASE + path);
    if (res.ok) return res.json();
  } catch {}
  return null;
}

async function loadStatic(name) {
  const res = await fetch(STATIC_PREFIX + name);
  if (!res.ok) throw new Error(`Failed to load static file: ${name}`);
  return res.json();
}

// ── Per-year EE live caches (cleared on sign-out) ───────────────────────
const _liveStatsCache = {};   // { [`${fid}_${year}`]: stats }
const _liveNdviCache = {};    // { [year]: { values, inProgress, window } }

// Field geometry is loaded one district at a time (60 fields each) instead of
// the full 19 MB national collection. `_fieldById` lets the stats/yield path
// find the geometry for whichever field the user has selected.
const _fieldsCache = {};          // { [districtSlug]: FeatureCollection }
const _fieldById = new Map();     // field id → Feature

// 600 centroids (40 KB) — enough for a live NDVI percentile across every
// mapped field without shipping or querying the full polygons.
let _fieldPointsRef = null;

// ── Live-query error reporting ──────────────────────────────────────────
// A failed Earth Engine call falls back to precomputed data, but the user
// should still see why (wrong project, no EE access, expired token, …).
let _onLiveError = null;

export function setLiveErrorHandler(handler) {
  _onLiveError = handler;
}

function reportLiveError(context, err) {
  const message = err?.message || String(err);
  console.warn(`[Earth Engine] ${context}:`, err);
  if (_onLiveError) _onLiveError(`${context}: ${message}`);
}

function clearLiveError() {
  if (_onLiveError) _onLiveError(null);
}

// ── Live-query progress reporting ───────────────────────────────────────
// NDVI percentiles need every mapped field, which takes several Earth Engine
// round-trips. Surface progress so a slow query never looks like a freeze.
let _onLiveProgress = null;

export function setLiveProgressHandler(handler) {
  _onLiveProgress = handler;
}

function reportLiveProgress(message) {
  if (_onLiveProgress) _onLiveProgress(message);
}

export function setFieldPointsRef(points) {
  _fieldPointsRef = Array.isArray(points) ? points : null;
}

export function clearLiveCaches() {
  Object.keys(_liveStatsCache).forEach((k) => delete _liveStatsCache[k]);
  Object.keys(_liveNdviCache).forEach((k) => delete _liveNdviCache[k]);
  reportLiveProgress(null);
}

// ── Precomputed static data (fallback) ─────────────────────────────────
const _fieldStatsCache = {};
const _fieldNdviCache = {};

async function loadFieldStats(year) {
  if (_fieldStatsCache[year]) return _fieldStatsCache[year];
  try {
    const data = await loadStatic(`field_stats_${year}.json`);
    _fieldStatsCache[year] = data;
    return data;
  } catch {
    return null;
  }
}

async function loadFieldNdvi(year) {
  if (_fieldNdviCache[year]) return _fieldNdviCache[year];
  try {
    const data = await loadStatic(`field_ndvi_${year}.json`);
    _fieldNdviCache[year] = data;
    return data;
  } catch {
    return null;
  }
}

// ── Cached static data ─────────────────────────────────────────────────
let _allStatsCache = null;
let _allStatsPromise = null;

// ── API functions ───────────────────────────────────────────────────────
function districtSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Cotton-field polygons for one district. Files live in `data/fields/` and
 * are 0.5–2.3 MB each, so the map stays responsive instead of parsing the
 * 19 MB province-wide collection up front.
 */
export async function fetchFields(districtName) {
  if (!districtName) return { type: 'FeatureCollection', features: [] };

  const slug = districtSlug(districtName);
  if (_fieldsCache[slug]) return _fieldsCache[slug];

  let data;
  try {
    data = await loadStatic(`fields/${slug}.geojson`);
  } catch {
    // Districts without mapped cotton fields have no file.
    data = { type: 'FeatureCollection', features: [] };
  }
  _fieldsCache[slug] = data;
  for (const feature of data.features) {
    _fieldById.set(String(feature.properties.id), feature);
  }
  return data;
}

/** Centroids for every mapped field (used for fast live NDVI). */
export async function fetchFieldPoints() {
  const points = await loadStatic('field_points.json');
  setFieldPointsRef(points);
  return points;
}

export async function fetchDistrict() {
  const data = await apiCall('/districts');
  if (data) return data;
  return loadStatic('sindh_districts.geojson');
}

export async function fetchDistricts() {
  return fetchDistrict();
}

export async function fetchAllDistrictStats() {
  if (_allStatsCache) return _allStatsCache;
  // Cache the in-flight promise too: App and the district-stats effect both
  // ask for this file on mount, which otherwise downloads it twice.
  if (!_allStatsPromise) {
    _allStatsPromise = (async () => {
      const data = await apiCall('/districts/stats');
      if (data) return data;
      return loadStatic('sindh_district_stats.json');
    })().then((data) => {
      _allStatsCache = data;
      return data;
    });
  }
  return _allStatsPromise;
}

export async function fetchDistrictStats(districtName) {
  const data = await apiCall(`/district/${encodeURIComponent(districtName)}/stats`);
  if (data) return data;
  const allStats = await fetchAllDistrictStats();
  if (!allStats) return null;
  for (const [name, stats] of Object.entries(allStats)) {
    if (name.toLowerCase() === districtName.toLowerCase()) return stats;
  }
  return null;
}

/**
 * Climate stats: live EE → backend → precomputed.
 */
export async function fetchStats(fid, year) {
  // 1. Live EE query if authenticated
  if (isEEReady() && _fieldById.size) {
    const cacheKey = `${fid}_${year}`;
    if (_liveStatsCache[cacheKey]) return _liveStatsCache[cacheKey];

    const feature = _fieldById.get(String(fid));
    if (feature) {
      try {
        reportLiveProgress('Querying ERA5-Land, CHIRPS and MODIS…');
        const stats = await computeStats(feature.geometry, year);
        _liveStatsCache[cacheKey] = stats;
        clearLiveError();
        return stats;
      } catch (err) {
        reportLiveError('Earth Engine climate query failed', err);
      } finally {
        reportLiveProgress(null);
      }
    }
  }

  // 2. Backend
  const data = await apiCall(`/stats/${fid}?year=${year}`);
  if (data) return data;

  // 3. Precomputed static
  const fieldStats = await loadFieldStats(year);
  if (fieldStats && fieldStats[String(fid)]) {
    return fieldStats[String(fid)];
  }
  return { no_data: true, source: 'No data available for this field/year' };
}

/**
 * Yield: live EE NDVI → backend → precomputed.
 */
export async function fetchYield(fid, year) {
  // 1. Live EE NDVI if authenticated
  if (isEEReady() && _fieldPointsRef?.length) {
    if (!_liveNdviCache[year]) {
      try {
        const total = _fieldPointsRef.length;
        const result = await computeNdviForAllFields(_fieldPointsRef, year, (done, batches) => {
          reportLiveProgress(
            `Computing NDVI for ${total.toLocaleString()} fields (${done}/${batches})…`
          );
        });
        _liveNdviCache[year] = {
          values: result.values,
          inProgress: result.inProgress,
          window: result.windowStart
            ? `${result.windowStart} to ${result.windowEnd}`
            : null,
        };
      } catch (err) {
        reportLiveError('Earth Engine NDVI query failed', err);
        _liveNdviCache[year] = { values: {}, inProgress: false, window: null };
      } finally {
        reportLiveProgress(null);
      }
    }

    const liveNdvi = _liveNdviCache[year];
    const ndviVal = liveNdvi.values[String(fid)] ?? liveNdvi.values[fid] ?? null;
    const allVals = Object.values(liveNdvi.values).filter((v) => v != null);
    const percentile = ndviVal != null && allVals.length
      ? percentileRank(ndviVal, allVals)
      : null;

    const yieldData = await loadStatic('district_yield.json');
    const districts = yieldData.districts || {};
    let fallbackValue = null;
    for (const [, dData] of Object.entries(districts)) {
      if (dData.value != null) { fallbackValue = dData.value; break; }
    }

    return {
      year,
      district_yield: {
        season: yieldData.season ?? '\u2014',
        value: fallbackValue,
        unit: yieldData.unit ?? 'kg/ha',
        source: `PCCC/PBS ${yieldData.season ?? ''}`.trim(),
      },
      ndvi_estimate: {
        ndvi: ndviVal,
        percentile,
        window: liveNdvi.window,
        in_progress: liveNdvi.inProgress,
        status: ndviVal != null ? 'ok' : (liveNdvi.window ? 'ok' : 'not_started'),
        source: 'Sentinel-2 (live EE)',
      },
    };
  }

  // 2. Backend
  const data = await apiCall(`/yield/${fid}?year=${year}`);
  if (data) return data;

  // 3. Precomputed static
  const fieldNdvi = await loadFieldNdvi(year);
  const ndviValues = fieldNdvi?.values || {};
  const staticNdviVal = ndviValues[String(fid)] ?? ndviValues[fid] ?? null;

  let percentile = null;
  if (staticNdviVal !== null) {
    const allVals = Object.values(ndviValues).filter((v) => v !== null);
    if (allVals.length > 0) {
      percentile = (100.0 * allVals.filter((v) => v <= staticNdviVal).length) / allVals.length;
    }
  }

  const yieldData = await loadStatic('district_yield.json');
  const districts = yieldData.districts || {};
  let fallbackValue = null;
  for (const [, dData] of Object.entries(districts)) {
    if (dData.value !== null) { fallbackValue = dData.value; break; }
  }

  return {
    year,
    district_yield: {
      season: yieldData.season ?? '\u2014',
      value: fallbackValue,
      unit: yieldData.unit ?? 'kg/ha',
      source: `PCCC/PBS ${yieldData.season ?? ''}`.trim(),
    },
    ndvi_estimate: {
      ndvi: staticNdviVal,
      percentile,
      window: fieldNdvi?.window ?? null,
      in_progress: fieldNdvi?.in_progress ?? false,
      status: staticNdviVal !== null ? 'ok' : (fieldNdvi?.window ? 'ok' : 'not_started'),
      source: 'Sentinel-2 (precomputed)',
    },
  };
}

export async function fetchSindhYieldHistory() {
  const data = await apiCall('/yield/sindh-history');
  if (data) return data;
  return loadStatic('sindh_cotton_yield_history.json');
}
