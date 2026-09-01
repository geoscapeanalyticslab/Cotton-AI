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

export async function fetchStats(fid, year) {
  const polygons = await fetchPolygons();
  const poly = polygons.features?.find(f => f.properties?.id == fid);
  return poly || null;
}

export async function fetchYield(fid, year) {
  // Yield data is in district_yield.json (district-level, not field-level)
  const yieldData = await load('district_yield.json');
  return yieldData;
}

export async function fetchSindhYieldHistory() {
  return load('sindh_cotton_yield_history.json');
}
