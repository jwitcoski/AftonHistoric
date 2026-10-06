#!/usr/bin/env python3
"""Snapshot Washington County GISViewer layers as GeoJSON for each live tour bbox."""

import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://maps.co.washington.mn.us/arcgis/rest/services/GISViewer"
# Water/1 and /2 are the geometry layers; Water/0 and its children are annotation text.
LAYERS = {
    "streets": ("Streets", 0),
    "water-lines": ("Water", 1),
    "water-protected": ("Water", 2),
    "parcels": ("Parcels", 0),
    "parks": ("ParksRec", 1),
    "trails": ("ParksRec", 0),
    "facilities": ("Facilities", 0),
    "address-points": ("AddressPoints", 0),
    "contours": ("Elevation", 0),
    "historic-parcels": ("Cadastral_PV", 21),
    "plats": ("Cadastral_PV", 22),
}
# Parcels carry owner names, mailing addresses and sale/value data; keep only property facts.
PARCEL_FIELDS = (
    "PIN", "TAXPIN", "Acres_Poly", "USE1_DESC", "USE2_DESC", "PLAT_NAME", "BLOCK", "LOT",
    "YEAR_BUILT", "SITUS_ADDRESS", "BLDG_NUM", "CITY", "ZIP",
)


def query(service, layer, bbox):
    """Return all features in bbox as one FeatureCollection, following the server's paging limit."""
    envelope = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"
    features, offset = [], 0
    while True:
        params = urllib.parse.urlencode({
            "f": "geojson", "where": "1=1", "outFields": "*", "outSR": 4326, "inSR": 4326,
            "geometry": envelope, "geometryType": "esriGeometryEnvelope",
            "spatialRel": "esriSpatialRelIntersects", "resultOffset": offset,
        })
        request = urllib.request.Request(
            f"{BASE}/{service}/MapServer/{layer}/query?{params}",
            headers={"User-Agent": "AftonHistoric/0.1 (community history project)"},
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            page = json.load(response)
        if "error" in page:
            raise SystemExit(f"{service}/{layer}: {page['error']}")
        features += page["features"]
        if not page.get("exceededTransferLimit") and not page.get("properties", {}).get("exceededTransferLimit"):
            return {"type": "FeatureCollection", "features": features}
        offset = len(features)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tour", help="Only this tour id")
    args = parser.parse_args()

    tours = json.loads((ROOT / "data" / "historic" / "tours.json").read_text(encoding="utf-8"))
    for tour in tours:
        if not tour["bbox"] or (args.tour and tour["id"] != args.tour):
            continue
        out = ROOT / "data" / "county" / tour["id"]
        out.mkdir(parents=True, exist_ok=True)
        for name, (service, layer) in LAYERS.items():
            collection = query(service, layer, tour["bbox"])
            if name == "parcels":
                for feature in collection["features"]:
                    feature["properties"] = {k: feature["properties"].get(k) for k in PARCEL_FIELDS}
            (out / f"{name}.geojson").write_text(json.dumps(collection), encoding="utf-8")
            print(f"{tour['id']}/{name}: {len(collection['features'])} features")


if __name__ == "__main__":
    main()
