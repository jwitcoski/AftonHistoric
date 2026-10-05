#!/usr/bin/env python3
"""Package the Afton OSM and DEM products as a Global Ski Atlas city clay scene."""

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import box, mapping, shape

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TARGET_ROOT = ROOT.parent / "GlobalSkiAtlas_2"
SCENE_ID = "afton_historic_minnesota"
SCENE_TITLE = "Afton Historic Map"
SOURCE_OSM = ROOT / "data" / "processed" / "afton.geojson"
SOURCE_TERRAIN = ROOT / "data" / "processed" / "afton-terrain" / "terrain"
SOURCE_SITES = ROOT / "data" / "historic" / "sites.json"
CATEGORIES = {
    "roads": lambda tags, geometry: bool(tags.get("highway")),
    "buildings": lambda tags, geometry: bool(tags.get("building")),
    "water": lambda tags, geometry: bool(tags.get("waterway") or tags.get("natural") == "water"),
    "landuse": lambda tags, geometry: bool(tags.get("landuse") or tags.get("leisure") or (tags.get("natural") and tags.get("natural") != "water")),
    "places": lambda tags, geometry: geometry == "Point" and bool(tags.get("amenity") or tags.get("historic") or tags.get("tourism")),
}


def transform_coordinates(value, transformer, origin_easting, origin_northing):
    if isinstance(value[0], (int, float)):
        easting, northing = transformer.transform(float(value[0]), float(value[1]))
        return [easting - origin_easting, northing - origin_northing]
    return [transform_coordinates(part, transformer, origin_easting, origin_northing) for part in value]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-root", type=Path, default=DEFAULT_TARGET_ROOT)
    parser.add_argument("--force", action="store_true", help="Replace this generated Afton city scene")
    args = parser.parse_args()

    manifest_source = SOURCE_TERRAIN / "terrain-metadata.json"
    for path in (SOURCE_OSM, manifest_source, SOURCE_TERRAIN / "terrain-mesh.glb"):
        if not path.is_file():
            raise SystemExit(f"Required source asset missing: {path}")

    destination = args.target_root / "clay_scenes" / "cities" / SCENE_ID
    if destination.exists() and not args.force:
        raise SystemExit(f"Scene already exists: {destination}. Review it or pass --force to replace generated assets.")
    if destination.exists():
        shutil.rmtree(destination)

    terrain_metadata = json.loads(manifest_source.read_text(encoding="utf-8"))
    coordinate_system = terrain_metadata["local_crs"]
    origin = coordinate_system["local_origin"]
    transformer = Transformer.from_crs("EPSG:4326", coordinate_system["projected_crs"], always_xy=True)
    bounds = terrain_metadata["heightfield"]["bounds_local_m"]
    clip_bounds = box(bounds["min_east_m"], bounds["min_north_m"], bounds["max_east_m"], bounds["max_north_m"])
    source_collection = json.loads(SOURCE_OSM.read_text(encoding="utf-8"))
    historic_sites = json.loads(SOURCE_SITES.read_text(encoding="utf-8"))
    vector_dir = destination / "vectors"
    terrain_dir = destination / "terrain"
    vector_dir.mkdir(parents=True)
    terrain_dir.mkdir(parents=True)

    counts = {}
    local_buildings = []
    for name, predicate in CATEGORIES.items():
        features = []
        for feature in source_collection.get("features", []):
            tags = feature.get("properties") or {}
            geometry = feature.get("geometry") or {}
            if not predicate(tags, geometry.get("type")):
                continue
            local_geometry = {
                "type": geometry["type"],
                "coordinates": transform_coordinates(
                    geometry["coordinates"], transformer,
                    origin["easting_m"], origin["northing_m"],
                ),
            }
            clipped = shape(local_geometry).intersection(clip_bounds)
            if clipped.is_empty:
                continue
            if name == "buildings" and clipped.geom_type in {"Polygon", "MultiPolygon"}:
                local_buildings.append((clipped, feature.get("id")))
            features.append({
                "type": "Feature",
                "id": feature.get("id"),
                "properties": tags,
                "geometry": mapping(clipped),
            })
        (vector_dir / f"{name}.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")),
            encoding="utf-8",
        )
        counts[name] = len(features)

    site_features = []
    for site in sorted(historic_sites, key=lambda item: item["order"]):
        easting, northing = transformer.transform(site["lon"], site["lat"])
        point = shape({
            "type": "Point",
            "coordinates": [easting - origin["easting_m"], northing - origin["northing_m"]],
        })
        if site["id"] == "town-square-park":
            geometry = point
            building_id = None
        else:
            nearest = min(local_buildings, key=lambda item: item[0].distance(point), default=None)
            if nearest and nearest[0].distance(point) <= 75:
                geometry, building_id = nearest
            else:
                geometry, building_id = point, None
        geometry = geometry.intersection(clip_bounds)
        if geometry.is_empty:
            raise ValueError(f"Historic site outside exported terrain bounds: {site['id']}")
        site_features.append({
            "type": "Feature",
            "id": f"historic/{site['id']}",
            "properties": {**site, "osm_building_feature": building_id},
            "geometry": mapping(geometry),
        })
    (vector_dir / "historic-sites.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": site_features}, separators=(",", ":")),
        encoding="utf-8",
    )
    counts["historic_sites"] = len(site_features)

    for filename in ("terrain-mesh.glb", "terrain-metadata.json", "heightfield-u16.bin", "heightfield-metadata.json"):
        shutil.copy2(SOURCE_TERRAIN / filename, terrain_dir / filename)

    manifest = {
        "scene_schema_version": "0.1.0-city",
        "scene_kind": "historic_city",
        "scene_id": SCENE_ID,
        "display_name": SCENE_TITLE,
        "location": "Afton, Minnesota, United States",
        "build_timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coordinate_system": coordinate_system,
        "terrain": {
            "mesh": "terrain/terrain-mesh.glb",
            "mesh_metadata": "terrain/terrain-metadata.json",
            "heightfield": "terrain/heightfield-u16.bin",
            "heightfield_metadata": "terrain/heightfield-metadata.json",
            "elevation_min_m": terrain_metadata["elevation_min_m"],
            "elevation_max_m": terrain_metadata["elevation_max_m"],
            "vertex_spacing_m": terrain_metadata["mesh"]["vertex_spacing_m"],
            "height_exaggerate": 1,
        },
        "vectors": {**{name: f"vectors/{name}.geojson" for name in CATEGORIES}, "historic_sites": "vectors/historic-sites.geojson"},
        "camera": {"suggested_hero_span": 100},
        "data_counts": counts,
        "attribution": {
            "osm": "© OpenStreetMap contributors",
            "dem": "Mapzen Skadi / AWS Terrain Tiles",
            "license_notes": "OSM data is available under ODbL. Preserve attribution when using or redistributing these assets.",
        },
        "history_note": "The OSM and DEM layers describe the present-day landscape and are shown only for the Today era. No historic scene data is included yet.",
    }
    (destination / "scene-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (destination / "README.md").write_text(
        "# Afton Historic Map scene\n\n"
        "City terrain and OSM vector layers packaged for the Global Ski Atlas clay renderer. "
        "Terrain mesh and 5 m heightfield derive from the Afton Skadi DEM export. Vector GeoJSON "
        "is projected to local UTM 15N meters relative to the terrain origin.\n\n"
        "OSM layers are present-day context, not historic evidence. OSM attribution: © OpenStreetMap contributors (ODbL).\n",
        encoding="utf-8",
    )

    catalog_dir = args.target_root / "clay_scenes" / "cities"
    catalog_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = catalog_dir / "catalog.json"
    catalog = {"schema_version": "1.0", "cities": []}
    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    cities = [city for city in catalog.get("cities", []) if city.get("id") != SCENE_ID]
    cities.append({"id": SCENE_ID, "display_name": SCENE_TITLE, "location": "Afton, Minnesota", "scene_path": SCENE_ID, "ready": True})
    catalog["cities"] = cities
    catalog_path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")

    print(f"Wrote city scene to {destination}")
    print("Vector features: " + ", ".join(f"{key}={value}" for key, value in counts.items()))


if __name__ == "__main__":
    main()
