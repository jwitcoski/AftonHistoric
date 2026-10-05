#!/usr/bin/env python3
"""Download an OpenStreetMap extract for Afton, Minnesota."""

import argparse
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
RIVER_RELATION_URL = "https://api.openstreetmap.org/api/0.6/relation/272005/full"
# Bounded to roughly the current 1.9 km x 1.5 km Three.js map footprint.
AFTON_BBOX = (44.8952, -92.7950, 44.9088, -92.7710)  # south, west, north, east
DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "data" / "osm" / "afton.osm.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output raw Overpass JSON path")
    parser.add_argument("--dry-run", action="store_true", help="Print the Overpass query without making a request")
    args = parser.parse_args()

    south, west, north, east = AFTON_BBOX
    selectors = [
        f"way[highway]({south},{west},{north},{east});",
        f"way[building]({south},{west},{north},{east});",
        f"way[waterway]({south},{west},{north},{east});",
        f"way[natural~\"water|wood|wetland\"]({south},{west},{north},{east});",
        f"way[landuse]({south},{west},{north},{east});",
        f"way[leisure]({south},{west},{north},{east});",
        f"node[amenity]({south},{west},{north},{east});",
        f"node[historic]({south},{west},{north},{east});",
        f"node[tourism]({south},{west},{north},{east});",
    ]
    query = f"[out:json][timeout:90];({' '.join(selectors)});out body geom;"
    if args.dry_run:
        print(query)
        return

    failures = []
    payload = None
    for endpoint in OVERPASS_URLS:
        request = urllib.request.Request(
            endpoint,
            data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
            headers={"User-Agent": "AftonHistoric/0.1 (community history project)"},
        )
        try:
            with urllib.request.urlopen(request, timeout=150) as response:
                payload = json.load(response)
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            failures.append(f"{endpoint}: {error}")
            print(f"Overpass endpoint unavailable, trying next mirror: {endpoint}")
    if payload is None:
        raise SystemExit("All Overpass downloads failed:\n" + "\n".join(failures))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Saved {len(payload.get('elements', []))} OSM elements to {args.output}")

    relation_output = args.output.parent / "relation-272005-full.osm"
    request = urllib.request.Request(
        RIVER_RELATION_URL,
        headers={"User-Agent": "AftonHistoric/0.1 (community history project)"},
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            relation_output.write_bytes(response.read())
        print(f"Saved complete Saint Croix River relation to {relation_output}")
    except urllib.error.URLError as error:
        raise SystemExit(f"OSM extract downloaded, but Saint Croix River relation fetch failed: {error}") from error


if __name__ == "__main__":
    main()
