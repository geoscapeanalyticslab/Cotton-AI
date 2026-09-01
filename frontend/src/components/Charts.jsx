import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function withLabels(monthly) {
  return monthly.map((m) => ({ ...m, label: MONTH_NAMES[m.month] }));
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      {payload.map((p) => (
        <div className="chart-tooltip-row" key={p.dataKey}>
          <span className="chart-tooltip-swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong className="tabular">{formatter ? formatter(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

const gridProps = { stroke: 'var(--border)', vertical: false };
const axisProps = {
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  axisLine: { stroke: 'var(--border-strong)' },
  tickLine: false,
};

export function TemperatureChart({ monthly }) {
  const data = withLabels(monthly);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} unit="°" />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}°C`} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        <Line
          type="monotone"
          dataKey="t_mean_c"
          name="Mean air temp"
          stroke="var(--series-temp)"
          strokeWidth={2}
          dot={{ r: 3 }}
          strokeLinecap="round"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RainfallChart({ monthly }) {
  const data = withLabels(monthly);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} unit="mm" />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)} mm`} />} cursor={{ fill: 'var(--surface-2)' }} />
        <Bar dataKey="precip_mm" name="Rainfall (CHIRPS)" fill="var(--series-rain)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LstChart({ monthly, nightMean }) {
  const data = withLabels(monthly);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} unit="°" />
        <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(1)}°C`} />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        {typeof nightMean === 'number' && (
          <ReferenceLine
            y={nightMean}
            stroke="var(--series-lst-night)"
            strokeDasharray="4 4"
            label={{ value: 'Night mean', position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="lst_day_c"
          name="LST — day"
          stroke="var(--series-lst-day)"
          strokeWidth={2}
          dot={{ r: 3 }}
          strokeLinecap="round"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SindhHistoryTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">{label}</div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: 'var(--color-primary)' }} />
        <span>Yield</span>
        <strong className="tabular">{point.yield_kg_ha.toFixed(1)} kg/ha</strong>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-swatch" style={{ background: 'var(--text-muted)' }} />
        <span>Area under cotton</span>
        <strong className="tabular">{point.area_000_ha.toFixed(1)} '000 ha</strong>
      </div>
    </div>
  );
}

export function SindhYieldHistoryChart({ years, averageYield, selectedSeason }) {
  const selectedPoint = selectedSeason ? years.find((y) => y.season === selectedSeason) : undefined;

  return (
    <ResponsiveContainer width="100%" height={190}>
      <ComposedChart data={years} margin={{ top: 18, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="season" {...axisProps} interval={1} angle={-40} textAnchor="end" height={40} />
        <YAxis {...axisProps} width={42} />
        <Tooltip content={<SindhHistoryTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeDasharray: '3 3' }} />
        {typeof averageYield === 'number' && (
          <ReferenceLine
            y={averageYield}
            stroke="var(--text-muted)"
            strokeDasharray="4 4"
            label={{ value: `Avg ${averageYield.toFixed(0)} kg/ha`, position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 10 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="yield_kg_ha"
          name="Sindh cotton yield"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={{ r: 2 }}
          strokeLinecap="round"
          isAnimationActive={false}
        />
        {selectedPoint && (
          <ReferenceDot
            x={selectedPoint.season}
            y={selectedPoint.yield_kg_ha}
            r={6}
            fill="var(--color-accent)"
            stroke="var(--surface-2)"
            strokeWidth={2}
            isFront
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
