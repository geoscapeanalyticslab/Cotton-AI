import StatCard from './StatCard';
import { SindhYieldHistoryChart } from './Charts';
import { ResponsiveContainer, ComposedChart, Bar, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

function fmt(v, digits = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Number(v.toFixed(digits));
}

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function seasonForYear(year) {
  const nextTwo = String((year + 1) % 100).padStart(2, '0');
  return `${year}-${nextTwo}`;
}

function SindhHistorySection({ sindhHistory, sindhHistoryError, year }) {
  const selectedSeason = year ? seasonForYear(year) : undefined;
  const selectedPoint = sindhHistory && selectedSeason
    ? sindhHistory.years.find((y) => y.season === selectedSeason)
    : undefined;

  return (
    <section className="sindh-history">
      <div className="sindh-history-heading">
        <h3>Sindh Province &mdash; Cotton Yield</h3>
        <span className="sindh-history-sub">Official published per-season figures</span>
      </div>

      {sindhHistoryError && <div className="sidebar-status sidebar-error">{sindhHistoryError}</div>}

      {sindhHistory && !sindhHistoryError && (
        <>
          {selectedSeason && (
            <div className={`sindh-history-selected${selectedPoint ? '' : ' is-unpublished'}`}>
              {selectedPoint ? (
                <>
                  <span className="sindh-history-selected-label">Season {selectedPoint.season}</span>
                  <span className="sindh-history-selected-value tabular">
                    {selectedPoint.yield_kg_ha.toFixed(1)} {sindhHistory.unit_yield}
                  </span>
                  <span className="sindh-history-selected-area">
                    Area under cotton: {selectedPoint.area_000_ha.toFixed(1)} {sindhHistory.unit_area}
                  </span>
                </>
              ) : (
                <span className="sindh-history-selected-label">
                  No published Sindh yield figure yet for {selectedSeason} &mdash; latest available is {sindhHistory.years[sindhHistory.years.length - 1].season}
                </span>
              )}
            </div>
          )}
          <SindhYieldHistoryChart
            years={sindhHistory.years}
            averageYield={sindhHistory.average_yield_kg_ha}
            selectedSeason={selectedPoint ? selectedSeason : undefined}
          />
          <div className="sindh-history-meta">
            <span className="sindh-history-source">Data Source: {sindhHistory.source}</span>
          </div>
        </>
      )}
    </section>
  );
}

export default function YieldPanel({
  selected,
  selectedDistrict,
  districtStats,
  yieldData,
  loading,
  error,
  sindhHistory,
  sindhHistoryError,
  year,
}) {
  // Option A: Field polygon is selected
  if (selected) {
    return (
      <aside className="yield-panel">
        <div className="sidebar-header">
          <div>
            <div className="sidebar-eyebrow">Cotton field #{selected.id}</div>
            <h2>{selected.district} District</h2>
          </div>
        </div>

        {loading && (
          <div className="sidebar-status">
            <div className="spinner" />
            Loading yield data&hellip;
          </div>
        )}

        {error && !loading && <div className="sidebar-status sidebar-error">{error}</div>}

        {yieldData && !loading && !error && (
          <>
            <section className="stat-grid">
              <StatCard
                label={`Official District Yield (${yieldData.district_yield.season ?? '—'} Season)`}
                value={yieldData.district_yield.value}
                unit={yieldData.district_yield.unit}
                accent="var(--color-primary)"
                sub={
                  yieldData.district_yield.value !== null
                    ? undefined
                    : 'No official figure configured yet for this district'
                }
                source={`PCCC/PBS ${yieldData.district_yield.season ?? ''}`.trim()}
              />
              <StatCard
                label="In-Season NDVI Estimate"
                value={fmt(yieldData.ndvi_estimate.ndvi)}
                unit=""
                accent="var(--series-rain)"
                sub={
                  yieldData.ndvi_estimate.status === 'not_started'
                    ? `Boll-formation window (Aug–Sep) hasn't started for ${yieldData.year}`
                    : yieldData.ndvi_estimate.percentile !== null
                      ? `${ordinal(Math.round(yieldData.ndvi_estimate.percentile))} percentile across mapped fields`
                      : undefined
                }
                source="Sentinel-2 (GEE)"
              />
            </section>

            <div className="yield-disclaimer">
              NDVI estimate is a relative vegetation index derived from real Sentinel-2 imagery.
            </div>

            <SindhHistorySection sindhHistory={sindhHistory} sindhHistoryError={sindhHistoryError} year={year} />
          </>
        )}
      </aside>
    );
  }

  // Option B: District is selected
  const yearsData = districtStats?.years || [];

  return (
    <aside className="yield-panel">
      <div className="sidebar-header">
        <div>
          <div className="sidebar-eyebrow">District Agriculture (2018–2026)</div>
          <h2>{selectedDistrict || 'Sanghar'} District</h2>
        </div>
      </div>

      <div className="district-panel-compact">
        <h4 className="chart-title">Cotton Fields Trend (2018–2026)</h4>
        {yearsData.length > 0 && (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={yearsData} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={36} />
              <Tooltip cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="cotton_fields" name="Cotton Fields" fill="#1baf7a" radius={[3, 3, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <SindhHistorySection sindhHistory={sindhHistory} sindhHistoryError={sindhHistoryError} year={year} />
    </aside>
  );
}
