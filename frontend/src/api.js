export async function fetchPolygons() {
  const res = await fetch('/api/polygons');
  if (!res.ok) throw new Error('Failed to load cotton field polygons');
  return res.json();
}

export async function fetchDistrict() {
  const res = await fetch('/api/districts');
  if (!res.ok) throw new Error('Failed to load district boundaries');
  return res.json();
}

export async function fetchDistricts() {
  return fetchDistrict();
}

export async function fetchAllDistrictStats() {
  const res = await fetch('/api/districts/stats');
  if (!res.ok) throw new Error('Failed to load all district stats');
  return res.json();
}

export async function fetchDistrictStats(districtName) {
  const res = await fetch(`/api/district/${encodeURIComponent(districtName)}/stats`);
  if (!res.ok) throw new Error(`Failed to load stats for district: ${districtName}`);
  return res.json();
}

export async function fetchStats(fid, year) {
  const res = await fetch(`/api/stats/${fid}?year=${year}`);
  if (!res.ok) throw new Error('Failed to load climate stats for this field');
  return res.json();
}

export async function fetchYield(fid, year) {
  const res = await fetch(`/api/yield/${fid}?year=${year}`);
  if (!res.ok) throw new Error('Failed to load yield data for this field');
  return res.json();
}

export async function fetchSindhYieldHistory() {
  const res = await fetch('/api/yield/sindh-history');
  if (!res.ok) throw new Error('Failed to load Sindh cotton yield history');
  return res.json();
}
