import { useEffect, useMemo, useState, useCallback } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import ChartsPanel from './components/ChartsPanel';
import YieldPanel from './components/YieldPanel';
import {
  fetchFields,
  fetchFieldPoints,
  fetchDistricts,
  fetchAllDistrictStats,
  fetchDistrictStats,
  fetchStats,
  fetchYield,
  fetchSindhYieldHistory,
  setFieldPointsRef,
  clearLiveCaches,
  setLiveErrorHandler,
  setLiveProgressHandler,
} from './api';
import { signIn, signOut, preloadEarthEngine } from './ee/auth';
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
  const [fieldPoints, setFieldPoints] = useState(null);
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

  const [eeAuthenticated, setEeAuthenticated] = useState(false);
  const [eeSigningIn, setEeSigningIn] = useState(false);
  const [eeError, setEeError] = useState(null);
  const [eeLiveError, setEeLiveError] = useState(null);
  const [eeLiveStatus, setEeLiveStatus] = useState(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    // Fetch the Google + Earth Engine scripts in the background so the
    // sign-in popup opens instantly when the user clicks the button.
    preloadEarthEngine();
  }, []);

  useEffect(() => {
    setLiveErrorHandler(setEeLiveError);
    setLiveProgressHandler(setEeLiveStatus);
    return () => {
      setLiveErrorHandler(null);
      setLiveProgressHandler(null);
    };
  }, []);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => {});
    fetchAllDistrictStats().then(setAllDistrictStats).catch(() => {});
    fetchSindhYieldHistory().then(setSindhHistory).catch((e) => setSindhHistoryError(e.message));
    fetchFieldPoints()
      .then((points) => {
        setFieldPoints(points);
        setFieldPointsRef(points);
      })
      .catch(() => {});
  }, []);

  // Load only the selected district's field polygons (0.5–2.3 MB instead of
  // the 19 MB province-wide file), so the map is usable immediately.
  useEffect(() => {
    if (!selectedDistrict) {
      setPolygons(null);
      return undefined;
    }
    let cancelled = false;
    setPolygons(null);
    setLoadError(null);
    fetchFields(selectedDistrict)
      .then((data) => {
        if (!cancelled) setPolygons(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message);
      });
    return () => { cancelled = true; };
  }, [selectedDistrict]);

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

  // Re-fetch stats when EE auth state changes or year/field changes
  const statsDeps = `${selectedId}_${year}_${eeAuthenticated}`;
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
    return () => { cancelled = true; };
  }, [statsDeps]);

  const yieldDeps = `${selectedId}_${year}_${eeAuthenticated}`;
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
    return () => { cancelled = true; };
  }, [yieldDeps]);

  const handleSignIn = useCallback(async () => {
    setEeSigningIn(true);
    setEeError(null);
    setEeLiveError(null);
    try {
      await signIn();
      setEeAuthenticated(true);
      clearLiveCaches();
    } catch (err) {
      setEeError(err.message);
    } finally {
      setEeSigningIn(false);
    }
  }, []);

  const handleSignOut = useCallback(() => {
    signOut();
    setEeAuthenticated(false);
    setEeLiveError(null);
    setEeLiveStatus(null);
    clearLiveCaches();
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-title">
          <div className="brand-lockup">
            <img src="/Cotton-AI/cotton-icon-brown.png" alt="Cotton AI" className="brand-mark" width="32" height="32" />
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
          {fieldPoints && <span className="field-count">{fieldPoints.length} Mapped Fields</span>}
          {eeLiveStatus && (
            <span className="ee-live-status" title={eeLiveStatus}>
              <span className="ee-live-spinner" />
              {eeLiveStatus}
            </span>
          )}

          {/* EE Auth Button */}
          {eeAuthenticated ? (
            <span className="ee-auth-status ee-authenticated">
              <span className="ee-auth-dot" /> EE Connected
              <button type="button" className="ee-signout-btn" onClick={handleSignOut}>Sign out</button>
            </span>
          ) : (
            <button
              type="button"
              className="ee-signin-btn"
              onClick={handleSignIn}
              disabled={eeSigningIn}
            >
              {eeSigningIn ? 'Connecting...' : 'Sign in with Google (GEE)'}
            </button>
          )}
          {eeError && <span className="ee-auth-error">{eeError}</span>}
          {eeLiveError && (
            <span className="ee-auth-error" title={eeLiveError}>{eeLiveError}</span>
          )}

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

      {/* Main Full-Height Layout */}
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
          eeAuthenticated={eeAuthenticated}
        />
      </main>

      <ChartsPanel
        selected={selectedFeature ? selectedFeature.properties : null}
        stats={stats}
        loading={statsLoading}
        error={statsError}
      />

      <footer className="app-footer">
        <span>
          &copy; {new Date().getFullYear()} Geoscape Analytics Lab &middot; Data:
          Google Earth Engine (ERA5-Land, CHIRPS, Sentinel-2)
        </span>
        <nav className="app-footer-links">
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy Policy</a>
          <a href={`${import.meta.env.BASE_URL}terms.html`}>Terms of Service</a>
          <a
            href="https://github.com/geoscapeanalyticslab/Cotton-AI"
            target="_blank"
            rel="noreferrer noopener"
          >
            Source
          </a>
        </nav>
      </footer>
    </div>
  );
}
