#!/usr/bin/env python3
"""Build Afton's Three.js terrain mesh and heightfield with the shared GIS pipeline."""

import argparse
import importlib
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PIPELINE_ROOT = ROOT.parent / "globalskiatlas_data"
DEFAULT_DEM = ROOT / "data" / "dem" / "afton-dem.tif"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "afton-terrain"
DEFAULT_PUBLIC = ROOT / "public" / "data" / "terrain"
PUBLISHED_FILES = (
    "terrain-mesh.glb",
    "terrain-metadata.json",
    "heightfield-u16.bin",
    "heightfield-metadata.json",
)


def load_pipeline(pipeline_root):
    if not (pipeline_root / "game_export" / "terrain.py").is_file():
        raise SystemExit(
            f"GIS pipeline not found at {pipeline_root}. "
            "Pass --pipeline-root or set GLOBALSKIATLAS_DATA_ROOT."
        )
    sys.path.insert(0, str(pipeline_root))
    config = importlib.import_module("game_export.config")
    terrain = importlib.import_module("game_export.terrain")
    return config, terrain


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dem", type=Path, nargs="?", default=DEFAULT_DEM, help="Input DEM GeoTIFF")
    parser.add_argument("--pipeline-root", type=Path, default=Path(os.environ.get("GLOBALSKIATLAS_DATA_ROOT", DEFAULT_PIPELINE_ROOT)))
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT, help="Generated terrain output directory")
    parser.add_argument("--public-dir", type=Path, default=DEFAULT_PUBLIC, help="Vite-served output directory")
    parser.add_argument("--mesh-resolution", type=float, default=10, help="Terrain mesh spacing in meters")
    parser.add_argument("--heightfield-resolution", type=float, default=5, help="Heightfield spacing in meters")
    parser.add_argument("--collision-resolution", type=float, default=10, help="Collision heightfield spacing in meters")
    parser.add_argument("--no-publish", action="store_true", help="Generate project artifacts without copying browser assets")
    args = parser.parse_args()
    if not args.dem.is_file():
        raise SystemExit(f"DEM file not found: {args.dem}. Run scripts/download/download_dem.py first.")

    config_module, terrain_module = load_pipeline(args.pipeline_root)
    cfg = config_module.config_from_mapping({
        "resort_id": "afton_city_minnesota",
        "display_name": "Afton, Minnesota",
        "winter_sports_id": "afton-city",
        "region": "north-america/us/minnesota",
        "state": "Minnesota",
        "country": "United States of America",
        "target_crs": "auto_utm",
        "terrain_mesh_resolution_m": args.mesh_resolution,
        "heightfield_resolution_m": args.heightfield_resolution,
        "collision_heightfield_resolution_m": args.collision_resolution,
    }, source="Afton city terrain config")
    try:
        terrain_module.export_terrain(args.dem, args.output_dir, cfg)
    except (OSError, RuntimeError, ValueError) as error:
        raise SystemExit(f"Afton heightmap generation failed: {error}") from error

    source_dir = args.output_dir / "terrain"
    if not args.no_publish:
        args.public_dir.mkdir(parents=True, exist_ok=True)
        for filename in PUBLISHED_FILES:
            source = source_dir / filename
            if not source.is_file():
                raise SystemExit(f"Expected terrain artifact missing: {source}")
            shutil.copy2(source, args.public_dir / filename)

    metadata_path = source_dir / "terrain-metadata.json"
    print(f"Terrain outputs: {source_dir}")
    print(f"Terrain mesh: {source_dir / 'terrain-mesh.glb'}")
    print(f"Heightfield: {source_dir / 'heightfield-u16.bin'}")
    if not args.no_publish:
        print(f"Browser assets: {args.public_dir}")
    print(f"Terrain metadata: {metadata_path}")


if __name__ == "__main__":
    main()
