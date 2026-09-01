// api.js — serves data from bundled static files (no backend needed)
// Uses relative paths so it works both on GitHub Pages (/Cotton-AI/) and localhost
const DATA = './data/';

async function load(name) {
  const res = await fetch(DATA + name);
  if (!res.ok) throw new Error(`Failed to load ${name}`);
  return res.json();
}

export async function fetchPolygons() {
  return load('cotton_polygons.geojson');
}

export async function fetchDistrict() {
  return load('sindh_districts.geojson');
}

export async function fetchDistricts() {
  return load('sindh_districts.geojson');
}

export async function fetchAllDistrictStats() {
  return load('sindh_district_stats.json');
}

export async function fetchDistrictStats(districtName) {
  const stats = await fetchAllDistrictStats();
  return stats[districtName] || null;
}

/**
 * Climate stats are only available via GEE backend (ERA5/CHIRPS/MODIS).
 * Returns null so the Sidebar shows a helpful "requires server" note instead of crashing.
 */
export async function fetchStats(fid, year) {
  // No local climate data available — return null to signal "not supported"
  return null;
}

/**
 * Yield data is returned as an object matching the shape YieldPanel expects:
 *   { district_yield: { season, value, unit }, ndvi_estimate: { status } }
 */
export async function fetchYield(fid, year) {
  const yieldData = await load('district_yield.json');
  // Build a per-field result using the latest season data available
  const districts = yieldData.districts || {};
  // Pick any non-null district yield as reference (since this is field-level data we don't have)
  let fallbackDistrict = null;
  let fallbackValue = null;
  for (const [dName, dData] of Object.entries(districts)) {
    if (dData.value !== null) {
      fallbackDistrict = dName;
      fallbackValue = dData.value;
      break;
    }
  }
  return {
    district_yield: {
      season: yieldData.season ?? '—',
      value: fallbackValue,
      unit: yieldData.unit ?? 'kg/ha',
    },
    ndvi_estimate: {
      status: 'not_available',
      ndvi: null,
      percentile: null,
    },
    year,
  };
}

export async function fetchSindhYieldHistory() {
  return load('sindh_cotton_yield_history.json');
}
