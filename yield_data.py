"""
Official district yield lookup — static, retrospective, hand-maintained each
completed season from PCCC/PBS published figures. See static/data/district_yield.json.

Also serves the Sindh province historical cotton yield series transcribed
from Agricultural Statistics of Pakistan 2023-24 (see
static/data/sindh_cotton_yield_history.json) — real published per-year
figures, not estimates.
"""
import json
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), "static", "data", "district_yield.json")
SINDH_HISTORY_PATH = os.path.join(
    os.path.dirname(__file__), "static", "data", "sindh_cotton_yield_history.json"
)


def load_table():
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_district_yield(district):
    table = load_table()
    season = table.get("season")
    unit = table.get("unit", "kg/ha")
    entry = table.get("districts", {}).get(district)
    value = entry.get("value") if entry else None
    return {
        "season": season,
        "unit": unit,
        "value": value,
        "source": f"PCCC/PBS {season}" if season else "PCCC/PBS",
    }


def load_sindh_yield_history():
    with open(SINDH_HISTORY_PATH, encoding="utf-8") as f:
        data = json.load(f)
    years = data["years"]
    avg_yield = sum(y["yield_kg_ha"] for y in years) / len(years)
    return {
        "province": data["province"],
        "unit_yield": data["unit_yield"],
        "unit_area": data["unit_area"],
        "source": data["source"],
        "years": years,
        "average_yield_kg_ha": round(avg_yield, 1),
    }
