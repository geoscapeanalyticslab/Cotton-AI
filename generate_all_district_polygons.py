"""
Generate Cotton Field Polygons for ALL Districts in Sindh (Pure Python, zero dependencies).

Iterates through all districts in static/data/sindh_districts.geojson and
generates classified cotton field polygons for every district in Sindh so that
zooming into any district reveals field polygons with climate data lookup support.
"""
import json
import math
import os
import random

DATA_DIR = os.path.join(os.path.dirname(__file__), "static", "data")
DISTRICTS_FILE = os.path.join(DATA_DIR, "sindh_districts.geojson")
POLYGONS_FILE = os.path.join(DATA_DIR, "cotton_polygons.geojson")


def get_bbox(coords_list):
    """Find bounding box for ring or nested coords."""
    lons = []
    lats = []

    def extract_pts(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            lons.append(c[0])
            lats.append(c[1])
        else:
            for sub in c:
                extract_pts(sub)

    extract_pts(coords_list)
    return min(lons), min(lats), max(lons), max(lats)


def point_in_polygon(x, y, poly_coords):
    """Ray casting algorithm for point in polygon check."""
    inside = False
    n = len(poly_coords)
    if n < 3:
        return True
    p1x, p1y = poly_coords[0]
    for i in range(n + 1):
        p2x, p2y = poly_coords[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def get_random_point_in_geojson_feature(feature):
    geom = feature["geometry"]
    gtype = geom["type"]
    coords = geom["coordinates"]

    minx, miny, maxx, maxy = get_bbox(coords)

    # Simple bounding box sample with centroid fallback
    if gtype == "Polygon":
        outer_ring = coords[0]
        for _ in range(100):
            rx = random.uniform(minx, maxx)
            ry = random.uniform(miny, maxy)
            if point_in_polygon(rx, ry, outer_ring):
                return rx, ry
        # fallback to average point
        return (minx + maxx) / 2.0, (miny + maxy) / 2.0

    if gtype == "MultiPolygon":
        # pick largest polygon ring
        best_ring = coords[0][0]
        max_len = len(best_ring)
        for poly in coords:
            if len(poly[0]) > max_len:
                best_ring = poly[0]
                max_len = len(poly[0])
        for _ in range(100):
            rx = random.uniform(minx, maxx)
            ry = random.uniform(miny, maxy)
            if point_in_polygon(rx, ry, best_ring):
                return rx, ry
        return (minx + maxx) / 2.0, (miny + maxy) / 2.0

    return (minx + maxx) / 2.0, (miny + maxy) / 2.0


def create_field_polygon(cx, cy, area_ha):
    # 1 ha ~ 0.000095 sq degrees near latitude 26N
    radius_deg = math.sqrt(area_ha * 0.000085)
    n_pts = random.randint(6, 8)
    coords = []
    for i in range(n_pts):
        angle = (2 * math.pi * i) / n_pts
        r = radius_deg * random.uniform(0.75, 1.25)
        px = cx + r * math.cos(angle) * 1.15
        py = cy + r * math.sin(angle)
        coords.append([round(px, 6), round(py, 6)])
    coords.append(coords[0])
    return coords


def main():
    if not os.path.exists(DISTRICTS_FILE):
        print("Districts file not found!")
        return

    with open(DISTRICTS_FILE, "r") as f:
        districts_geojson = json.load(f)

    existing_sanghar_fields = []
    if os.path.exists(POLYGONS_FILE):
        with open(POLYGONS_FILE, "r") as f:
            existing = json.load(f)
            for feat in existing.get("features", []):
                if feat.get("properties", {}).get("district") == "Sanghar":
                    existing_sanghar_fields.append(feat)

    print(f"Found {len(existing_sanghar_fields)} existing Sanghar field polygons.")

    all_field_features = []
    global_id = 0
    random.seed(42)

    for feat in districts_geojson["features"]:
        d_name = feat["properties"].get("district_name") or feat["properties"].get("ADM2_NAME")
        if not d_name:
            continue

        # For Sanghar, keep the existing high-res vectors
        if d_name == "Sanghar" and len(existing_sanghar_fields) > 50:
            for s_feat in existing_sanghar_fields:
                s_feat["id"] = global_id
                s_feat["properties"]["id"] = global_id
                s_feat["properties"]["district"] = d_name
                s_feat["properties"]["district_name"] = d_name
                all_field_features.append(s_feat)
                global_id += 1
            print(f"Added {len(existing_sanghar_fields)} fields for Sanghar.")
            continue

        # For all other districts in Sindh (Khairpur, Ghotki, Mirpur Khas, Badin, Dadu, Sukkur, Shaheed Benazirabad, etc.)
        n_fields = random.randint(25, 45)
        for _ in range(n_fields):
            lon, lat = get_random_point_in_geojson_feature(feat)
            area_ha = round(random.uniform(2.5, 18.5), 2)
            coords = create_field_polygon(lon, lat, area_ha)

            field_feature = {
                "type": "Feature",
                "id": global_id,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords]
                },
                "properties": {
                    "id": global_id,
                    "area_ha": area_ha,
                    "cluster": random.choice([8, 10, 12]),
                    "district": d_name,
                    "district_name": d_name,
                    "centroid_lat": round(lat, 5),
                    "centroid_lon": round(lon, 5)
                }
            }
            all_field_features.append(field_feature)
            global_id += 1

        print(f"Generated {n_fields} cotton field polygons for {d_name}.")

    fc = {
        "type": "FeatureCollection",
        "features": all_field_features
    }

    with open(POLYGONS_FILE, "w") as f:
        json.dump(fc, f)

    print(f"\nWrote total {len(all_field_features)} cotton field polygons across all districts of Sindh to {POLYGONS_FILE}")


if __name__ == "__main__":
    main()
