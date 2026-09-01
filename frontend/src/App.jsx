import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import ChartsPanel from './components/ChartsPanel';
import YieldPanel from './components/YieldPanel';
import {
  fetchPolygons,
  fetchDistricts,
  fetchAllDistrictStats,
  fetchDistrictStats,
  fetchStats,
  fetchYield,
  fetchSindhYieldHistory,
} from './api';
import './dashboard.css';

const SINDH_CENTER = [26.05, 68.95];

function getInitialTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [polygons, setPolygons] = useState(null);
  const [districts, setDistricts] = useState(null);
  const [allDistrictStats, setAllDistrictStats] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [selectedDistrict, setSelectedDistrict] = useState('Sanghar');
  const [selectedId, setSelectedId] = useState(null);
  const [year, setYear] = useState(2026);

  const [currentDistrictStats, setCurrentDistrictStats] = useState(null);

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  const [yieldData, setYieldData] = useState(null);
  const [yieldLoading, setYieldLoading] = useState(false);
  const [yieldError, setYieldError] = useState(null);

  const [sindhHistory, setSindhHistory] = useState(null);
  const [sindhHistoryError, setSindhHistoryError] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    fetchPolygons().then(setPolygons).catch((e) => setLoadError(e.message));
    fetchDistricts().then(setDistricts).catch(() => {});
    fetchAllDistrictStats().then(setAllDistrictStats).catch(() => {});
    fetchSindhYieldHistory().then(setSindhHistory).catch((e) => setSindhHistoryError(e.message));
  }, []);

  // Fetch stats for active district
  useEffect(() => {
    if (!selectedDistrict) {
      setCurrentDistrictStats(null);
      return;
    }
    fetchDistrictStats(selectedDistrict)
      .then(setCurrentDistrictStats)
      .catch(() => setCurrentDistrictStats(null));
  }, [selectedDistrict]);

  const selectedFeature = useMemo(() => {
    if (!polygons || selectedId === null) return null;
    return polygons.features.find((f) => f.properties.id === selectedId) || null;
  }, [polygons, selectedId]);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    fetchStats(selectedId, year)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setStatsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, year]);

  useEffect(() => {
    if (selectedId === null) return;
    let cancelled = false;
    setYieldLoading(true);
    setYieldError(null);
    fetchYield(selectedId, year)
      .then((data) => {
        if (!cancelled) setYieldData(data);
      })
      .catch((e) => {
        if (!cancelled) setYieldError(e.message);
      })
      .finally(() => {
        if (!cancelled) setYieldLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, year]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <div className="brand-lockup">
            <img src="/cotton-icon-brown.png" alt="Cotton AI" className="brand-mark" width="32" height="32" />
            <h1>
              Cotton<span className="brand-ai">AI</span> <span className="brand-suffix">Sindh Dashboard</span>
            </h1>
          </div>
          <span className="app-subtitle">
            All 21 Districts of Sindh, Pakistan &middot; GEE AlphaEarth Crop Classification & 2018–2026 Trends
          </span>
        </div>
        <div className="app-header-actions">
          {districts && <span className="field-count">{districts.features.length} Districts</span>}
          {polygons && <span className="field-count">{polygons.features.length} Mapped Fields</span>}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </header>

      {/* Main Full-Height Layout (Original Map Dimensions Restored) */}
      <main className="app-main">
        <YieldPanel
          selected={selectedFeature ? selectedFeature.properties : null}
          selectedDistrict={selectedDistrict}
          districtStats={currentDistrictStats}
          yieldData={yieldData}
          loading={yieldLoading}
          error={yieldError}
          sindhHistory={sindhHistory}
          sindhHistoryError={sindhHistoryError}
          year={year}
        />

        <div className="map-pane">
          {loadError && <div className="map-load-error">{loadError}</div>}
          <MapView
            polygons={polygons}
            districts={districts}
            selectedDistrict={selectedDistrict}
            onSelectDistrict={(dName) => {
              setSelectedDistrict(dName);
              setSelectedId(null);
            }}
            selectedId={selectedId}
            onSelectField={setSelectedId}
            isDark={theme === 'dark'}
            center={SINDH_CENTER}
            zoom={7.5}
          />
          <div className="map-legend">
            <span className="legend-swatch legend-swatch-district" /> Sindh District Boundary
            <span className="legend-swatch legend-swatch-field" style={{ marginLeft: 12 }} /> Cotton Field Polygon (Zoom In)
          </div>
        </div>

        <Sidebar
          selected={selectedFeature ? selectedFeature.properties : null}
          selectedDistrict={selectedDistrict}
          districtStats={currentDistrictStats}
          stats={stats}
          loading={statsLoading}
          error={statsError}
          year={year}
          onYearChange={setYear}
        />
      </main>

      {/* Granular Field Monthly Climate Charts */}
      <ChartsPanel
        selected={selectedFeature ? selectedFeature.properties : null}
        stats={stats}
        loading={statsLoading}
        error={statsError}
      />
    </div>
  );
}
