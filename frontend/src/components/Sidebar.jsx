import { useEffect, useState } from 'react';
import StatCard from './StatCard';

const EARLIEST_YEAR = 2018;
const CURRENT_YEAR = 2026;
const YEARS = Array.from({ length: CURRENT_YEAR - EARLIEST_YEAR + 1 }, (_, i) => CURRENT_YEAR - i);

const SOURCE_ERA5 = 'ECMWF ERA5-Land Daily Aggregated';
const SOURCE_CHIRPS = 'UCSB-CHG CHIRPS Daily';
const SOURCE_MODIS = 'MODIS MOD11A2 v061 (1km composite)';

function fmt(v, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Number(v.toFixed(digits));
}

function formatCoord(lat, lon) {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}

export default function Sidebar({
  selected,
  selectedDistrict,
  districtStats,
  stats,
  loading,
  error,
  year,
  onYearChange,
}) {
  const [rainfallSource, setRainfallSource] = useState('chirps');

  useEffect(() => {
    setRainfallSource('chirps');
  }, [stats]);

  // Mode 1: A specific cotton field polygon is selected
  if (selected) {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="sidebar-eyebrow">Cotton Field #{selected.id}</div>
            <h2>{selected.district} District</h2>
            <div className="sidebar-meta">
              {selected.area_ha?.toLocaleString()} ha &middot; unsupervised cluster {selected.cluster}
            </div>
            {formatCoord(selected.centroid_lat, selected.centroid_lon) && (
              <div className="sidebar-meta sidebar-coord tabular">
                {formatCoord(selected.centroid_lat, selected.centroid_lon)}
              </div>
            )}
          </div>
          <label className="year-select">
            Season
            <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  Apr&ndash;Nov {y} {y === CURRENT_YEAR ? '(2026 forecast)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <div className="sidebar-status">
            <div className="spinner" />
            Querying Earth Engine for real climate data&hellip;
          </div>
        )}

        {error && !loading && <div className="sidebar-status sidebar-error">{error}</div>}

        {stats && !loading && !error && !stats.no_data && (
          <>
            <section className="stat-grid">
              <StatCard
                label="Mean air temperature"
                value={fmt(stats.temperature.mean_c)}
                unit="°C"
                accent="var(--series-temp)"
                source={SOURCE_ERA5}
              />
              <StatCard
                label="Max air temperature"
                value={fmt(stats.temperature.max_c)}
                unit="°C"
                accent="var(--status-critical)"
                source={SOURCE_ERA5}
              />
              <StatCard
                label="Min air temperature"
                value={fmt(stats.temperature.min_c)}
                unit="°C"
                accent="var(--series-temp-night)"
                source={SOURCE_ERA5}
              />
              <StatCard
                label="Relative humidity"
                value={fmt(stats.relative_humidity_pct)}
                unit="%"
                accent="var(--color-secondary)"
                sub="Derived (Magnus-Tetens) from mean air & dewpoint temp"
                source={SOURCE_ERA5}
              />
              <StatCard
                label="Total rainfall"
                value={
                  rainfallSource === 'era5'
                    ? fmt(stats.rainfall.era5_total_mm, 0)
                    : fmt(stats.rainfall.chirps_total_mm, 0)
                }
                unit="mm"
                accent="var(--series-rain)"
                sources={[
                  { key: 'chirps', label: 'CHIRPS', value: fmt(stats.rainfall.chirps_total_mm, 0), unit: 'mm' },
                  { key: 'era5', label: 'ERA5-Land', value: fmt(stats.rainfall.era5_total_mm, 0), unit: 'mm' },
                ]}
                activeSource={rainfallSource}
                onSourceChange={setRainfallSource}
              />
              <StatCard
                label="LST — day"
                value={fmt(stats.lst.day_mean_c)}
                unit="°C"
                accent="var(--series-lst-day)"
                sub={`Peak ${fmt(stats.lst.day_max_c)}°C`}
                source={SOURCE_MODIS}
              />
              <StatCard
                label="LST — night"
                value={fmt(stats.lst.night_mean_c)}
                unit="°C"
                accent="var(--series-lst-night)"
                source={SOURCE_MODIS}
              />
            </section>

            <footer className="sidebar-footer">
              <div className="source-tag"><strong>Sources:</strong> Real GEE Sentinel-2 &middot; ERA5-Land &middot; CHIRPS &middot; MODIS</div>
              <div className="data-notice-box">
                ℹ️ <strong>Data Notice:</strong> Climate stats are directly computed live from GEE satellite sensors.
              </div>
            </footer>
          </>
        )}
      </aside>
    );
  }

  // Mode 2: A District is selected
  const activeYearData = districtStats?.years?.find((y) => y.year === year) || districtStats?.years?.[districtStats.years.length - 1];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <div className="sidebar-eyebrow">District Level &middot; Sindh</div>
          <h2>{selectedDistrict || 'Sanghar'} District</h2>
          <div className="sidebar-meta">
            {districtStats?.total_agri_area_ha?.toLocaleString()} ha cropland total
          </div>
        </div>
        <label className="year-select">
          Season
          <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y} {y === 2022 ? '(Floods)' : y === CURRENT_YEAR ? '(Forecast)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="stat-grid">
        <StatCard
          label="Total Agricultural Fields"
          value={districtStats?.total_agri_fields?.toLocaleString()}
          unit="fields"
          accent="#3b82f6"
          source="ESA WorldCover v200 (Class 40)"
        />
        <StatCard
          label={`Cotton Fields (${year})`}
          value={activeYearData?.cotton_fields?.toLocaleString()}
          unit="fields"
          accent="#1baf7a"
          sub={`${activeYearData?.cotton_pct}% of total cropland`}
          source="GEE AlphaEarth Unsupervised K-means"
        />
        <StatCard
          label={`Cotton Area (${year})`}
          value={activeYearData?.cotton_area_ha?.toLocaleString()}
          unit="ha"
          accent="var(--color-primary)"
          source="Vectorized Satellite Classification"
        />
        <StatCard
          label={`District Yield (${year})`}
          value={activeYearData?.yield_kg_ha}
          unit="kg/ha"
          accent="#d97706"
          source="PCCC / PBS Published Statistics"
        />
      </section>

      <div className="sidebar-hint-box">
        💡 <strong>Zoom in on the map</strong> to reveal individual cotton field polygons and click any polygon for real-time climate data.
      </div>

      <footer className="sidebar-footer">
        <div className="source-tag">
          <strong>Data Sources:</strong> FAO GAUL 2015 &middot; ESA WorldCover &middot; GEE AlphaEarth &middot; PCCC/PBS
        </div>
        <div className="data-notice-box warning-notice">
          ⚠️ <strong>Transparency Notice:</strong> Historical district yields (2018–2024) reflect published PBS/PCCC figures. 2025–2026 field counts & yields are unsupervised model estimates.
        </div>
      </footer>
    </aside>
  );
}
