import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

const gridProps = { stroke: 'var(--border)', vertical: false };
const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  axisLine: { stroke: 'var(--border-strong)' },
  tickLine: false,
};

function DistrictTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">Season {label}</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: '#1baf7a' }} />
        <span>Cotton Fields</span>
        <strong className="tabular">{data.cotton_fields.toLocaleString()}</strong>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: 'var(--text-muted)' }} />
        <span>Total Agri Fields</span>
        <strong className="tabular">{data.total_agri_fields.toLocaleString()}</strong>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: '#3b82f6' }} />
        <span>Cotton Adoption</span>
        <strong className="tabular">{data.cotton_pct}%</strong>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: '#d97706' }} />
        <span>Est. Yield</span>
        <strong className="tabular">{data.yield_kg_ha} kg/ha</strong>
      </div>
    </div>
  );
}

export default function DistrictStatsPanel({ districtName, stats, activeYear, onYearChange, onResetDistrict }) {
  if (!stats) {
    return (
      <div className="district-panel-card">
        <div className="district-panel-header">
          <h3>District Agricultural Summary (2018–2026)</h3>
        </div>
        <p className="district-panel-empty">
          Click any district on the map to inspect its 2018–2026 agricultural fields breakdown and cotton crop trends.
        </p>
      </div>
    );
  }

  const yearsData = stats.years || [];
  const currentYearData = yearsData.find((y) => y.year === activeYear) || yearsData[yearsData.length - 1];

  return (
    <div className="district-panel-card">
      <div className="district-panel-header">
        <div>
          <div className="district-tag">District &middot; Sindh Province</div>
          <h2>{stats.district_name} District</h2>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={onResetDistrict}>
          &larr; Sindh Overview
        </button>
      </div>

      <div className="district-metrics-grid">
        <div className="district-metric">
          <span className="metric-label">Total Agri Fields</span>
          <span className="metric-value">{stats.total_agri_fields?.toLocaleString()}</span>
          <span className="metric-sub">{stats.total_agri_area_ha?.toLocaleString()} ha cropland</span>
        </div>
        <div className="district-metric metric-highlight">
          <span className="metric-label">Cotton Fields ({activeYear})</span>
          <span className="metric-value">{currentYearData?.cotton_fields?.toLocaleString()}</span>
          <span className="metric-sub">{currentYearData?.cotton_pct}% of cropland</span>
        </div>
        <div className="district-metric">
          <span className="metric-label">Cotton Area ({activeYear})</span>
          <span className="metric-value">{currentYearData?.cotton_area_ha?.toLocaleString()} ha</span>
          <span className="metric-sub">classified fields</span>
        </div>
        <div className="district-metric">
          <span className="metric-label">Avg Yield (2018–2026)</span>
          <span className="metric-value">{stats.summary?.avg_yield_kg_ha} kg/ha</span>
          <span className="metric-sub">{currentYearData?.status === 'current_season' ? '2026 forecast' : 'historical'}</span>
        </div>
      </div>

      <div className="district-year-selector">
        <label htmlFor="year-select">Target Season Year: </label>
        <select
          id="year-select"
          value={activeYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className="year-dropdown"
        >
          {yearsData.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year} {y.year === 2022 ? '(Super Floods)' : y.year === 2026 ? '(Current Season)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="district-charts-container">
        <div className="district-chart-block">
          <h4>Cotton Fields vs Total Agricultural Fields (2018–2026)</h4>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={yearsData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis {...axisProps} width={44} />
              <Tooltip content={<DistrictTooltip />} />
              <Bar dataKey="cotton_fields" name="Cotton Fields" fill="#1baf7a" radius={[4, 4, 0, 0]} barSize={22} />
              <Line type="monotone" dataKey="total_agri_fields" name="Total Agri Fields" stroke="var(--text-muted)" strokeDasharray="3 3" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="district-chart-block">
          <h4>Cotton Crop Adoption Rate & Yield Trend</h4>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={yearsData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="year" {...axisProps} />
              <YAxis yAxisId="left" {...axisProps} width={38} unit="%" />
              <YAxis yAxisId="right" orientation="right" {...axisProps} width={42} unit="kg" />
              <Tooltip content={<DistrictTooltip />} />
              <Line yAxisId="left" type="monotone" dataKey="cotton_pct" name="Cotton Share (%)" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line yAxisId="right" type="monotone" dataKey="yield_kg_ha" name="Yield (kg/ha)" stroke="#d97706" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
