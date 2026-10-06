#!/usr/bin/env python3
"""Fail if a historic site is not on a county parcel or near a county road (the frames disagree)."""

import json
from pathlib import Path

from shapely.geometry import shape

V = Path(__file__).resolve().parents[2] / "public" / "data" / "afton-clay" / "vectors"
load = lambda name: [shape(f["geometry"]) for f in json.loads((V / name).read_text(encoding="utf-8"))["features"]]
parcels, roads = load("county-parcels.geojson"), load("county-streets.geojson")
bad = []
for site in json.loads((V / "historic-sites.geojson").read_text(encoding="utf-8"))["features"]:
    point = shape(site["geometry"]).representative_point()
    on_parcel = min(p.distance(point) for p in parcels)
    road = min(r.distance(point) for r in roads)
    print(f"{site['properties']['id']}: parcel {on_parcel:.1f} m, road {road:.1f} m")
    if on_parcel > 15 or road > 60:
        bad.append(site["properties"]["id"])
assert not bad, f"misaligned: {bad}"
print("alignment ok")
