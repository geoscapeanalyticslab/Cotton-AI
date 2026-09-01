import { TemperatureChart, RainfallChart, LstChart } from './Charts';

export default function ChartsPanel({ selected, stats, loading, error }) {
  if (!selected) {
    return (
      <section className="charts-row">
        <div className="charts-row-empty">Click a cotton field on the map to see its monthly climate trends here.</div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="charts-row">
        <div className="charts-row-empty">
          <div className="spinner" />
          Loading monthly trends&hellip;
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="charts-row">
        <div className="charts-row-empty charts-row-error">{error}</div>
      </section>
    );
  }

  if (!stats || stats.no_data) {
    return (
      <section className="charts-row">
        <div className="charts-row-empty">No monthly data yet for this season.</div>
      </section>
    );
  }

  return (
    <section className="charts-row">
      <div className="chart-panel">
        <h3>Monthly mean air temperature</h3>
        <TemperatureChart monthly={stats.monthly} />
      </div>
      <div className="chart-panel">
        <h3>Monthly rainfall (CHIRPS)</h3>
        <RainfallChart monthly={stats.monthly} />
      </div>
      <div className="chart-panel">
        <h3>Monthly land surface temperature</h3>
        <LstChart monthly={stats.monthly} nightMean={stats.lst.night_mean_c} />
      </div>
    </section>
  );
}
