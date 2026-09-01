export default function StatCard({ label, value, unit, accent, sub, source, sources, activeSource, onSourceChange }) {
  const display = value === null || value === undefined || Number.isNaN(value) ? '—' : value;
  const hasToggle = Array.isArray(sources) && sources.length > 1;

  return (
    <div className="stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value tabular" style={accent ? { color: accent } : undefined}>
        {display}
        {unit && display !== '—' ? <span className="stat-card-unit">{unit}</span> : null}
      </div>
      {sub ? <div className="stat-card-sub">{sub}</div> : null}

      {hasToggle ? (
        <div className="stat-card-source-toggle" role="group" aria-label={`${label} data source`}>
          <span className="stat-card-source-toggle-label">Source:</span>
          {sources.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`stat-card-source-btn${s.key === activeSource ? ' is-active' : ''}`}
              onClick={() => onSourceChange && onSourceChange(s.key)}
              title={`${s.label}: ${s.value ?? '—'} ${s.unit ?? ''}`.trim()}
            >
              {s.label}
            </button>
          ))}
        </div>
      ) : source ? (
        <div className="stat-card-source">Source: {source}</div>
      ) : null}
    </div>
  );
}
