#!/usr/bin/env python3
"""Convert a tour's county GeoJSON snapshot into the scene's local-meter frame and register it in the manifest."""

import argparse
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import box, mapping, shape

ROOT = Path(__file__).resolve().parents[2]
# Census CFCC road class -> the OSM highway values the scene styles by.
HIGHWAY = {"A31": "secondary", "A41": "residential", "A61": "residential"}
LAYERS = ("streets", "parcels", "parks", "address-points", "contours", "plats", "historic-parcels")


def to_local(value, transformer, origin):
    if isinstance(value[0], (int, float)):
        easting, northing = transformer.transform(float(value[0]), float(value[1]))
        return [easting - origin["easting_m"], northing - origin["northing_m"]]
    return [to_local(part, transformer, origin) for part in value]


def road_properties(props):
    highway = HIGHWAY.get(props.get("CFCC"))
    tags = {"highway": highway or "service", "name": props.get("ST_CONCAT"), "source": "washington-county"}
    if not highway:
        tags["service"] = "driveway"
    return tags


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tour", default="old-village")
    args = parser.parse_args()

    tour = next(t for t in json.loads((ROOT / "data" / "historic" / "tours.json").read_text(encoding="utf-8")) if t["id"] == args.tour)
    scene = ROOT / "public" / "data" / tour["sceneDir"]
    metadata = json.loads((ROOT / "public" / "data" / "terrain" / "terrain-metadata.json").read_text(encoding="utf-8"))
    crs = metadata["local_crs"]
    origin = crs["local_origin"]
    transformer = Transformer.from_crs("EPSG:4326", crs["projected_crs"], always_xy=True)
    b = metadata["heightfield"]["bounds_local_m"]
    clip = box(b["min_east_m"], b["min_north_m"], b["max_east_m"], b["max_north_m"])

    manifest_path = scene / "scene-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    vectors = manifest["vectors"]
    counts = manifest["data_counts"]
    # Keep the OSM roads once, so re-running never overwrites them with county roads.
    if "roads_osm" not in vectors:
        vectors["roads_osm"] = vectors["roads"]

    for name in LAYERS:
        source = json.loads((ROOT / "data" / "county" / tour["id"] / f"{name}.geojson").read_text(encoding="utf-8"))
        features = []
        for feature in source["features"]:
            geometry = feature.get("geometry")
            if not geometry:
                continue
            local = {"type": geometry["type"], "coordinates": to_local(geometry["coordinates"], transformer, origin)}
            clipped = shape(local).intersection(clip)
            if clipped.is_empty:
                continue
            props = road_properties(feature["properties"]) if name == "streets" else feature["properties"]
            features.append({"type": "Feature", "properties": props, "geometry": mapping(clipped)})
        key = "roads" if name == "streets" else f"county_{name.replace('-', '_')}"
        file = f"vectors/county-{name}.geojson"
        (scene / file).write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
        vectors[key] = file
        counts[key] = len(features)
        print(f"{key}: {len(features)} features")

    sites_path = scene / "vectors" / "historic-sites.geojson"
    sites = json.loads(sites_path.read_text(encoding="utf-8"))
    eras = {s["id"]: s["era"] for s in json.loads((ROOT / "data" / "historic" / "sites.json").read_text(encoding="utf-8"))}
    parcels = [(shape(f["geometry"]), f["properties"]) for f in json.loads((scene / "vectors" / "county-parcels.geojson").read_text(encoding="utf-8"))["features"]]
    for feature in sites["features"]:
        props = feature["properties"]
        props["era"] = eras[props["id"]]
        point = shape(feature["geometry"]).representative_point()
        parcel = next((p for geometry, p in parcels if geometry.contains(point)), {})
        props["parcel_pin"] = parcel.get("PIN")
        props["parcel_plat"] = " ".join(str(parcel[k]) for k in ("PLAT_NAME",) if parcel.get(k)) or None
    sites_path.write_text(json.dumps(sites, separators=(",", ":")), encoding="utf-8")

    manifest["attribution"]["county"] = "Washington County, MN GISViewer services (roads, parcels, parks, addresses, plats); contours derived from 2012 MN DNR lidar."
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
