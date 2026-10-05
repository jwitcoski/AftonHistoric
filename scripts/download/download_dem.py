#!/usr/bin/env python3
"""Fetch and crop a Mapzen Skadi DEM for the Afton map using the shared GIS pipeline."""

import argparse
import importlib
import sys
from pathlib import Path

from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PIPELINE_ROOT = ROOT.parent / "globalskiatlas_data"
DEFAULT_OUTPUT = ROOT / "data" / "dem" / "afton-dem.tif"
AFTON_BBOX = (-92.80078, 44.89615, -92.76727, 44.90972)  # west, south, east, north


def load_pipeline(pipeline_root):
    if not (pipeline_root / "game_export" / "inputs.py").is_file():
        raise SystemExit(
            f"GIS pipeline not found at {pipeline_root}. "
            "Pass --pipeline-root or set GLOBALSKIATLAS_DATA_ROOT."
        )
    sys.path.insert(0, str(pipeline_root))
    return importlib.import_module("game_export.inputs")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pipeline-root", type=Path, default=Path(__import__("os").environ.get("GLOBALSKIATLAS_DATA_ROOT", DEFAULT_PIPELINE_ROOT)))
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output cropped DEM GeoTIFF")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "data" / "dem" / ".cache", help="Skadi HGT tile cache")
    parser.add_argument("--bbox", nargs=4, type=float, metavar=("WEST", "SOUTH", "EAST", "NORTH"), default=AFTON_BBOX)
    args = parser.parse_args()

    try:
        inputs = load_pipeline(args.pipeline_root)
        west, south, east, north = args.bbox
        aoi = box(west, south, east, north)
        dem, dem_west, dem_south, dem_east, dem_north = inputs._mosaic_from_skadi_cache(
            aoi,
            args.cache_dir,
            fetch=True,
        )
        inputs._write_temp_dem(dem, dem_west, dem_south, dem_east, dem_north, args.output)
    except (ImportError, OSError, RuntimeError, ValueError) as error:
        raise SystemExit(f"DEM acquisition failed: {error}") from error

    print(f"Saved Skadi DEM GeoTIFF: {args.output}")
    print(f"Coverage: west={dem_west:.6f}, south={dem_south:.6f}, east={dem_east:.6f}, north={dem_north:.6f}")
    print(f"Raster samples: {dem.shape[1]} columns x {dem.shape[0]} rows")


if __name__ == "__main__":
    main()
