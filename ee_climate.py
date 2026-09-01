"""
Live climate-stat queries against Earth Engine for a single polygon.

Datasets used (all real, queried live — nothing fabricated):
  - ECMWF/ERA5_LAND/DAILY_AGGR  -> air temperature (mean/max/min), dewpoint
                                    (for relative humidity), total precipitation
  - UCSB-CHG/CHIRPS/DAILY       -> total rainfall (cross-check vs ERA5-Land)
  - MODIS/061/MOD11A2           -> land surface temperature (day/night)
"""
import datetime
import math

import ee

# reduceRegion samples raster pixel *centers*. ERA5-Land (~11km) and
# CHIRPS (~5.5km) pixels are far bigger than our field polygons (down to
# ~3 ha), so sampling at their native scale frequently finds no pixel
# center inside the polygon and silently returns null. None of these
# datasets vary below their native resolution, so sampling on a much
# finer grid is safe — it just reliably reads the one real covering
# pixel instead of missing it. Verified: querying the same ERA5 pixel at
# scale 50/100/250/1000 all return the identical value.
POINT_SCALE = 30  # meters; well under our smallest field polygon (~3 ha)

FULL_SEASON_MONTHS = list(range(4, 12))  # Apr..Nov, matches skills.py kharif window
MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def season_months_for_year(year, today=None):
    """Kharif season months (Apr-Nov) available for `year`, clamped to today.

    ERA5-Land / CHIRPS / MODIS all lag real time by days to a couple of
    months, but clamping to the calendar month keeps the API from asking
    Earth Engine for months that haven't happened yet. Returns [] for a
    future year, or for the current year before April.
    """
    today = today or datetime.date.today()
    if year > today.year:
        return []
    if year < today.year:
        return list(FULL_SEASON_MONTHS)
    return [m for m in FULL_SEASON_MONTHS if m <= today.month]


def _relative_humidity(t_mean_c, dewpoint_c):
    """Magnus-Tetens approximation of mean RH (%) from mean air & dewpoint temp."""
    if t_mean_c is None or dewpoint_c is None:
        return None

    def es(t):
        return 6.1094 * math.exp((17.625 * t) / (t + 243.04))

    rh = 100.0 * (es(dewpoint_c) / es(t_mean_c))
    return max(0.0, min(100.0, rh))


def compute_stats(geometry, year):
    today = datetime.date.today()
    months = season_months_for_year(year, today)

    if not months:
        empty_sources = {
            "temperature_humidity_rainfall_era5": "ECMWF/ERA5_LAND/DAILY_AGGR",
            "rainfall_chirps": "UCSB-CHG/CHIRPS/DAILY",
            "lst": "MODIS/061/MOD11A2",
        }
        return {
            "year": year,
            "season": f"Apr-Nov {year}",
            "in_progress": False,
            "no_data": True,
            "temperature": {"mean_c": None, "max_c": None, "min_c": None},
            "relative_humidity_pct": None,
            "rainfall": {"chirps_total_mm": None, "era5_total_mm": None},
            "lst": {"day_mean_c": None, "day_max_c": None, "night_mean_c": None},
            "monthly": [],
            "sources": empty_sources,
        }

    in_progress = year == today.year and months[-1] == today.month

    season_start = ee.Date.fromYMD(year, months[0], 1)
    season_end = ee.Date.fromYMD(year, months[-1], 1).advance(1, "month")
    if in_progress:
        season_end = ee.Date.fromYMD(today.year, today.month, today.day)

    era5 = (
        ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR")
        .filterDate(season_start, season_end)
        .filterBounds(geometry)
    )
    chirps = (
        ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY")
        .filterDate(season_start, season_end)
        .filterBounds(geometry)
    )
    modis = (
        ee.ImageCollection("MODIS/061/MOD11A2")
        .filterDate(season_start, season_end)
        .filterBounds(geometry)
    )

    t_mean = era5.select("temperature_2m").mean().subtract(273.15)
    t_max = era5.select("temperature_2m_max").max().subtract(273.15)
    t_min = era5.select("temperature_2m_min").min().subtract(273.15)
    dewpoint = era5.select("dewpoint_temperature_2m").mean().subtract(273.15)
    era5_precip_mm = era5.select("total_precipitation_sum").sum().multiply(1000)

    chirps_precip_mm = chirps.select("precipitation").sum()

    lst_day = modis.select("LST_Day_1km").mean().multiply(0.02).subtract(273.15)
    lst_night = modis.select("LST_Night_1km").mean().multiply(0.02).subtract(273.15)
    lst_day_max = modis.select("LST_Day_1km").max().multiply(0.02).subtract(273.15)

    seasonal_img = ee.Image.cat(
        [
            t_mean.rename("t_mean_c"),
            t_max.rename("t_max_c"),
            t_min.rename("t_min_c"),
            dewpoint.rename("dewpoint_c"),
            era5_precip_mm.rename("era5_precip_mm"),
            lst_day.rename("lst_day_c"),
            lst_night.rename("lst_night_c"),
            lst_day_max.rename("lst_day_max_c"),
        ]
    )
    seasonal_reduced = seasonal_img.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=geometry,
        scale=POINT_SCALE,
        bestEffort=True,
        maxPixels=1e9,
        tileScale=4,
    )
    chirps_reduced = chirps_precip_mm.rename("chirps_precip_mm").reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=geometry,
        scale=POINT_SCALE,
        bestEffort=True,
        maxPixels=1e9,
        tileScale=4,
    )

    def monthly_feature(m):
        m = ee.Number(m).toInt()
        start = ee.Date.fromYMD(year, m, 1)
        end = start.advance(1, "month")
        era5_m = era5.filterDate(start, end)
        chirps_m = chirps.filterDate(start, end)
        modis_m = modis.filterDate(start, end)

        m_t_mean = era5_m.select("temperature_2m").mean().subtract(273.15)
        m_precip = chirps_m.select("precipitation").sum()
        m_lst_day = modis_m.select("LST_Day_1km").mean().multiply(0.02).subtract(273.15)

        img = ee.Image.cat(
            [m_t_mean.rename("t_mean_c"), m_precip.rename("precip_mm"), m_lst_day.rename("lst_day_c")]
        )
        red = img.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geometry,
            scale=POINT_SCALE,
            bestEffort=True,
            maxPixels=1e9,
            tileScale=4,
        )
        return ee.Feature(None, red).set("month", m)

    monthly_fc = ee.FeatureCollection(ee.List(months).map(monthly_feature))

    # Single round trip each: seasonal scalars, chirps total, monthly series.
    seasonal = seasonal_reduced.getInfo()
    chirps_total = chirps_reduced.getInfo()
    monthly = monthly_fc.getInfo()["features"]

    t_mean_v = seasonal.get("t_mean_c")
    dewpoint_v = seasonal.get("dewpoint_c")
    rh = _relative_humidity(t_mean_v, dewpoint_v)

    monthly_series = []
    for feat in monthly:
        p = feat["properties"]
        monthly_series.append(
            {
                "month": p.get("month"),
                "t_mean_c": p.get("t_mean_c"),
                "precip_mm": p.get("precip_mm"),
                "lst_day_c": p.get("lst_day_c"),
            }
        )

    season_label = f"Apr-{MONTH_NAMES[months[-1]]} {year}"
    if in_progress:
        season_label += f" (in progress, through {today.isoformat()})"

    return {
        "year": year,
        "season": season_label,
        "in_progress": in_progress,
        "no_data": False,
        "temperature": {
            "mean_c": t_mean_v,
            "max_c": seasonal.get("t_max_c"),
            "min_c": seasonal.get("t_min_c"),
        },
        "relative_humidity_pct": rh,
        "rainfall": {
            "chirps_total_mm": chirps_total.get("chirps_precip_mm"),
            "era5_total_mm": seasonal.get("era5_precip_mm"),
        },
        "lst": {
            "day_mean_c": seasonal.get("lst_day_c"),
            "day_max_c": seasonal.get("lst_day_max_c"),
            "night_mean_c": seasonal.get("lst_night_c"),
        },
        "monthly": monthly_series,
        "sources": {
            "temperature_humidity_rainfall_era5": "ECMWF/ERA5_LAND/DAILY_AGGR",
            "rainfall_chirps": "UCSB-CHG/CHIRPS/DAILY",
            "lst": "MODIS/061/MOD11A2",
        },
    }
