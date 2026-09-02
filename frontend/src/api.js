// api.js — hybrid mode: try backend /api/* first, fall back to bundled static files
const API_BASE = '/api';
const STATIC_PREFIX = '/Cotton-AI/data/';

async function apiCall(path) {
  const res = await fetch(API_BASE + path);
  if (res.ok) return res.json();
  return null;
}

/** Load a static JSON/GeoJSON file from the deployed /Cotton-AI/data/ path. */
async function loadStatic(name) {
  const res = await fetch(STATIC_PREFIX + name);
  if (!res.ok) throw new Error(`Failed to load static file: ${name}`);
  return res.json();
}

// ── CACHED static data ──────────────────────────────────────────────────
let _polygonsCache = null;
let _districtsCache = null;
let _allStatsCache = null;
let _yieldHistoryCache = null;
let _districtYieldCache = null;

async function getCached(key, loader) {
  const cache = {
    polygons: '_polygonsCache',
    districts: '_districtsCache',
    allStats: '_allStatsCache',
    yieldHistory: '_yieldHistoryCache',
    districtYield: '_districtYieldCache',
  }[key];
  if (cache in globalThis) return globalThis[cache];
  const val = await loader();
  globalThis[cache] = val;
  return val;
}

// ── API functions ───────────────────────────────────────────────────────
export async function fetchPolygons() {
  const data = await apiCall('/polygons');
  if (data) return data;
  return loadStatic('cotton_polygons.geojson');
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
  const data = await apiCall('/districts/stats');
  if (data) return data;
  return loadStatic('sindh_district_stats.json');
}

export async function fetchDistrictStats(districtName) {
  const data = await apiCall(`/district/${encodeURIComponent(districtName)}/stats`);
  if (data) return data;
  // fallback: case-insensitive lookup in bundled data
  const allStats = await fetchAllDistrictStats();
  if (!allStats) return null;
  for (const [name, stats] of Object.entries(allStats)) {
    if (name.toLowerCase() === districtName.toLowerCase()) return stats;
  }
  return null;
}

/**
 * Climate stats are computed live by GEE via the Python backend.
 * If no backend is reachable, return a graceful no_data marker
 * so the UI shows an informative message instead of crashing.
 */
export async function fetchStats(fid, year) {
  const data = await apiCall(`/stats/${fid}?year=${year}`);
  if (data) return data;
  return { no_data: true, source: 'GEE backend not reachable' };
}

/**
 * Yield combines district-level published yield + field-level NDVI from GEE.
 * Falls back to bundled district_yield reference when backend is unavailable.
 */
export async function fetchYield(fid, year) {
  const data = await apiCall(`/yield/${fid}?year=${year}`);
  if (data) return data;

  // Build a graceful fallback from bundled district_yield data
  const yieldData = await loadStatic('district_yield.json');
  const districts = yieldData.districts || {};
  let fallbackValue = null;
  for (const [dName, dData] of Object.entries(districts)) {
    if (dData.value !== null) { fallbackValue = dData.value; break; }
  }
  return {
    year,
    district_yield: {
      season: yieldData.season ?? '—',
      value: fallbackValue,
      unit: yieldData.unit ?? 'kg/ha',
    },
    ndvi_estimate: {
      status: 'not_available',
      ndvi: null,
      percentile: null,
      window: null,
      in_progress: false,
      source: 'GEE backend not reachable',
    },
  };
}

export async function fetchSindhYieldHistory() {
  const data = await apiCall('/yield/sindh-history');
  if (data) return data;
  return loadStatic('sindh_cotton_yield_history.json');
}
