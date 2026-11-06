/**
 * Live climate-stat queries against Earth Engine for a single polygon.
 * Browser-side port of ee_climate.py — uses the EE JavaScript API.
 *
 * Datasets:
 *  - ECMWF/ERA5_LAND/DAILY_AGGR  → temperature, dewpoint, precipitation
 *  - UCSB-CHG/CHIRPS/DAILY       → rainfall cross-check
 *  - MODIS/061/MOD11A2           → land surface temperature
 */
import { getEE } from './auth';
import { evaluate } from './evaluate';

const POINT_SCALE = 30;
const FULL_SEASON_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11];
const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function seasonMonthsForYear(year) {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth() + 1;

  if (year > todayYear) return [];
  if (year < todayYear) return FULL_SEASON_MONTHS;
  return FULL_SEASON_MONTHS.filter((m) => m <= todayMonth);
}

function relativeHumidity(tMeanC, dewpointC) {
  if (tMeanC == null || dewpointC == null) return null;
  const es = (t) => 6.1094 * Math.exp((17.625 * t) / (t + 243.04));
  const rh = 100.0 * (es(dewpointC) / es(tMeanC));
  return Math.max(0, Math.min(100, rh));
}

/**
 * Compute climate stats for a polygon geometry (GeoJSON) for a given year.
 * Returns a plain object (already resolved from EE).
 */
export async function computeStats(geometry, year) {
  const ee = getEE();
  const now = new Date();
  const months = seasonMonthsForYear(year);

  const eeGeometry = ee.Geometry(geometry);

  if (!months.length) {
    return {
      year,
      season: `Apr-Nov ${year}`,
      in_progress: false,
      no_data: true,
      temperature: { mean_c: null, max_c: null, min_c: null },
      relative_humidity_pct: null,
      rainfall: { chirps_total_mm: null, era5_total_mm: null },
      lst: { day_mean_c: null, day_max_c: null, night_mean_c: null },
      monthly: [],
      sources: {
        temperature_humidity_rainfall_era5: 'ECMWF/ERA5_LAND/DAILY_AGGR',
        rainfall_chirps: 'UCSB-CHG/CHIRPS/DAILY',
        lst: 'MODIS/061/MOD11A2',
      },
    };
  }

  const inProgress = year === now.getFullYear() && months[months.length - 1] === now.getMonth() + 1;

  const seasonStart = ee.Date.fromYMD(year, months[0], 1);
  let seasonEnd = ee.Date.fromYMD(year, months[months.length - 1], 1).advance(1, 'month');
  if (inProgress) {
    seasonEnd = ee.Date.fromYMD(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  const era5 = ee.ImageCollection('ECMWF/ERA5_LAND/DAILY_AGGR')
    .filterDate(seasonStart, seasonEnd)
    .filterBounds(eeGeometry);

  const chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(seasonStart, seasonEnd)
    .filterBounds(eeGeometry);

  const modis = ee.ImageCollection('MODIS/061/MOD11A2')
    .filterDate(seasonStart, seasonEnd)
    .filterBounds(eeGeometry);

  const tMean = era5.select('temperature_2m').mean().subtract(273.15);
  const tMax = era5.select('temperature_2m_max').max().subtract(273.15);
  const tMin = era5.select('temperature_2m_min').min().subtract(273.15);
  const dewpoint = era5.select('dewpoint_temperature_2m').mean().subtract(273.15);
  const era5PrecipMm = era5.select('total_precipitation_sum').sum().multiply(1000);
  const chirpsPrecipMm = chirps.select('precipitation').sum();
  const lstDay = modis.select('LST_Day_1km').mean().multiply(0.02).subtract(273.15);
  const lstNight = modis.select('LST_Night_1km').mean().multiply(0.02).subtract(273.15);
  const lstDayMax = modis.select('LST_Day_1km').max().multiply(0.02).subtract(273.15);

  const seasonalImg = ee.Image.cat([
    tMean.rename('t_mean_c'),
    tMax.rename('t_max_c'),
    tMin.rename('t_min_c'),
    dewpoint.rename('dewpoint_c'),
    era5PrecipMm.rename('era5_precip_mm'),
    chirpsPrecipMm.rename('chirps_precip_mm'),
    lstDay.rename('lst_day_c'),
    lstNight.rename('lst_night_c'),
    lstDayMax.rename('lst_day_max_c'),
  ]);

  // Seasonal reduction — single getInfo() call
  const seasonalReduced = seasonalImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: eeGeometry,
    scale: POINT_SCALE,
    bestEffort: true,
    maxPixels: 1e9,
    tileScale: 4,
  });

  // Monthly series
  const monthlyFeatures = ee.FeatureCollection(
    ee.List(months).map((m) => {
      m = ee.Number(m).toInt();
      const start = ee.Date.fromYMD(year, m, 1);
      const end = start.advance(1, 'month');

      const era5M = era5.filterDate(start, end);
      const chirpsM = chirps.filterDate(start, end);
      const modisM = modis.filterDate(start, end);

      const mTMean = era5M.select('temperature_2m').mean().subtract(273.15);
      const mPrecip = chirpsM.select('precipitation').sum();
      const mLstDay = modisM.select('LST_Day_1km').mean().multiply(0.02).subtract(273.15);

      const img = ee.Image.cat([
        mTMean.rename('t_mean_c'),
        mPrecip.rename('precip_mm'),
        mLstDay.rename('lst_day_c'),
      ]);

      const red = img.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: eeGeometry,
        scale: POINT_SCALE,
        bestEffort: true,
        maxPixels: 1e9,
        tileScale: 4,
      });

      return ee.Feature(null, red).set('month', m);
    })
  );

  // Single round-trip: get seasonal + monthly together.
  // `evaluate()` keeps the request async — `getInfo()` would block the tab.
  const [seasonalResult, monthlyResult] = await Promise.all([
    evaluate(seasonalReduced),
    evaluate(monthlyFeatures),
  ]);

  const tMeanV = seasonalResult.t_mean_c;
  const dewpointV = seasonalResult.dewpoint_c;
  const rh = relativeHumidity(tMeanV, dewpointV);

  const monthlySeries = monthlyResult.features.map((feat) => {
    const p = feat.properties;
    return {
      month: p.month,
      t_mean_c: p.t_mean_c,
      precip_mm: p.precip_mm,
      lst_day_c: p.lst_day_c,
    };
  });

  let seasonLabel = `Apr-${MONTH_NAMES[months[months.length - 1]]} ${year}`;
  if (inProgress) {
    const today = now.toISOString().slice(0, 10);
    seasonLabel += ` (in progress, through ${today})`;
  }

  return {
    year,
    season: seasonLabel,
    in_progress: inProgress,
    no_data: false,
    temperature: {
      mean_c: tMeanV,
      max_c: seasonalResult.t_max_c,
      min_c: seasonalResult.t_min_c,
    },
    relative_humidity_pct: rh,
    rainfall: {
      chirps_total_mm: seasonalResult.chirps_precip_mm,
      era5_total_mm: seasonalResult.era5_precip_mm,
    },
    lst: {
      day_mean_c: seasonalResult.lst_day_c,
      day_max_c: seasonalResult.lst_day_max_c,
      night_mean_c: seasonalResult.lst_night_c,
    },
    monthly: monthlySeries,
    sources: {
      temperature_humidity_rainfall_era5: 'ECMWF/ERA5_LAND/DAILY_AGGR',
      rainfall_chirps: 'UCSB-CHG/CHIRPS/DAILY',
      lst: 'MODIS/061/MOD11A2',
    },
  };
}
