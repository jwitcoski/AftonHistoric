#!/usr/bin/env python3
"""Convert downloaded Overpass JSON to GeoJSON for the Three.js scene."""

import argparse
import json
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "osm" / "afton.osm.json"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "afton.geojson"
WEB_OUTPUT = ROOT / "public" / "data" / "processed" / "afton.geojson"
AREA_KEYS = {"building", "landuse", "leisure", "amenity", "natural", "water", "waterway", "military"}


def as_lon_lat(point):
    return [point["lon"], point["lat"]]


def way_geometry(element):
    points = [as_lon_lat(point) for point in element.get("geometry", [])]
    if len(points) < 2:
        return None
    tags = element.get("tags", {})
    is_closed = points[0] == points[-1]
    is_area = is_closed and any(key in tags for key in AREA_KEYS) and "highway" not in tags and "waterway" not in tags
    if is_area and len(points) >= 4:
        return {"type": "Polygon", "coordinates": [points]}
    return {"type": "LineString", "coordinates": points}


def convert(payload):
    features = []
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        if not tags:
            continue
        if element["type"] == "way":
            geometry = way_geometry(element)
        elif element["type"] == "node" and any(key in tags for key in ("amenity", "historic", "tourism")):
            geometry = {"type": "Point", "coordinates": [element["lon"], element["lat"]]}
        else:
            geometry = None
        if geometry:
            features.append({
                "type": "Feature",
                "id": f"{element['type']}/{element['id']}",
                "properties": {**tags, "osm_type": element["type"], "osm_id": element["id"]},
                "geometry": geometry,
            })
    return {"type": "FeatureCollection", "name": "Afton OpenStreetMap extract", "features": features}


def read_osm_xml(path):
    root = ET.parse(path).getroot()
    nodes = {
        node.attrib["id"]: {"lon": float(node.attrib["lon"]), "lat": float(node.attrib["lat"])}
        for node in root.findall("node")
    }
    elements = []
    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        if not tags:
            continue
        points = [nodes[nd.attrib["ref"]] for nd in way.findall("nd") if nd.attrib["ref"] in nodes]
        elements.append({"type": "way", "id": int(way.attrib["id"]), "tags": tags, "geometry": points})
    for node in root.findall("node"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in node.findall("tag")}
        if tags:
            elements.append({
                "type": "node",
                "id": int(node.attrib["id"]),
                "tags": tags,
                "lon": float(node.attrib["lon"]),
                "lat": float(node.attrib["lat"]),
            })
    return {"elements": elements}


def read_relation_feature(path, relation_id, clip_bounds):
    try:
        from shapely.geometry import box, mapping
        from shapely.geometry import LineString
        from shapely.ops import polygonize, unary_union
    except ImportError as error:
        raise SystemExit("Relation multipolygon processing requires Shapely from the GIS pipeline environment.") from error

    root = ET.parse(path).getroot()
    relation = next((item for item in root.findall("relation") if item.attrib.get("id") == str(relation_id)), None)
    if relation is None:
        raise SystemExit(f"OSM relation {relation_id} not found in {path}")
    nodes = {
        node.attrib["id"]: (float(node.attrib["lon"]), float(node.attrib["lat"]))
        for node in root.findall("node")
    }
    ways = {way.attrib["id"]: way for way in root.findall("way")}
    role_lines = {"outer": [], "inner": []}
    missing_members = []
    for member in relation.findall("member"):
        role = member.attrib.get("role", "outer") or "outer"
        if member.attrib.get("type") != "way" or role not in role_lines:
            continue
        way = ways.get(member.attrib.get("ref"))
        if way is None:
            missing_members.append(member.attrib.get("ref"))
            continue
        coordinates = [nodes[node.attrib["ref"]] for node in way.findall("nd") if node.attrib.get("ref") in nodes]
        if len(coordinates) >= 2:
            role_lines[role].append(LineString(coordinates))
    if missing_members:
        raise SystemExit(f"Relation {relation_id} is incomplete; {len(missing_members)} member ways are missing from {path}")

    rings = {role: list(polygonize(unary_union(lines))) for role, lines in role_lines.items() if lines}
    if not rings.get("outer"):
        raise SystemExit(f"Relation {relation_id} has no closed outer rings")
    geometry = unary_union(rings["outer"])
    if rings.get("inner"):
        geometry = geometry.difference(unary_union(rings["inner"]))
    west, south, east, north = clip_bounds
    geometry = geometry.intersection(box(west, south, east, north))
    if geometry.is_empty:
        raise SystemExit(f"Relation {relation_id} does not intersect the Afton map bounds")
    tags = {tag.attrib["k"]: tag.attrib["v"] for tag in relation.findall("tag")}
    return {
        "type": "Feature",
        "id": f"relation/{relation_id}",
        "properties": {**tags, "osm_type": "relation", "osm_id": int(relation_id)},
        "geometry": mapping(geometry),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", nargs="?", type=Path, default=DEFAULT_INPUT, help="Raw Overpass JSON")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output GeoJSON path")
    args = parser.parse_args()
    if not args.input.exists():
        raise SystemExit(f"OSM extract not found: {args.input}. Run scripts/download/download_osm.py first.")
    try:
        if args.input.suffix.lower() in {".osm", ".xml"}:
            payload = read_osm_xml(args.input)
        else:
            payload = json.loads(args.input.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, ET.ParseError) as error:
        raise SystemExit(f"Invalid OSM data in {args.input}: {error}") from error
    collection = convert(payload)
    supplemental_relation = args.input.parent / "relation-272005-full.osm"
    if supplemental_relation.is_file():
        area = json.loads((ROOT / "data" / "afton-area.json").read_text(encoding="utf-8"))
        bounds = area["bounds"]
        river = read_relation_feature(
            supplemental_relation,
            272005,
            (bounds["west"], bounds["south"], bounds["east"], bounds["north"]),
        )
        collection["features"].append(river)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(collection, separators=(",", ":"))
    args.output.write_text(serialized, encoding="utf-8")
    if args.output.resolve() != WEB_OUTPUT.resolve():
        WEB_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        WEB_OUTPUT.write_text(serialized, encoding="utf-8")
    print(f"Wrote {len(collection['features'])} OSM GeoJSON features to {args.output} and {WEB_OUTPUT}")


if __name__ == "__main__":
    main()