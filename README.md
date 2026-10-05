# Afton Historic Atlas

An interactive historical mapping and storytelling platform for the City of Afton, Minnesota. The experience is designed to let residents and visitors explore the settlement's changing landscape across three eras: its founding in 1855, incorporation in 1971, and Afton today.

The app presents Afton's terrain and OSM context in an interactive Three.js map, with era controls and a ten-stop Old Village story tour. Current roads, buildings, water, land use, trees, and vehicles are present-day context, not historical evidence. Historic stop descriptions and sources are maintained in `data/historic/sites.json`.

## Setup

Requirements: Node.js 20.19+ or 22.12+, npm, and Python 3.10+ for the data scripts.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Use the era buttons to change the scene, drag to orbit, scroll to zoom, click a marker for its details, and open the layer control to show or hide map layers. Add `?debug` to the URL to show the lil-gui scene controls.

The local `.env.local` supplies `VITE_MAPTILER_KEY` for the MapTiler raster basemap. For another machine, copy `.env.example` to `.env.local` and add a MapTiler key. Vite embeds `VITE_` values in browser code, so this is a public client key: restrict it to the deployed domain in the MapTiler account. OSM GIS overlays are loaded from the supplied local extract, with MapTiler and OpenStreetMap attribution shown in the app.

Build and preview the production bundle:

```sh
npm run build
npm run preview
```

## GitHub Pages

The site is published at `https://jwitcoski.github.io/AftonHistoric/` from the `gh-pages` branch. Configure GitHub Pages with **Settings > Pages > Build and deployment > Deploy from a branch**, selecting `gh-pages` and `/`.

Publish an updated build with:

```sh
npm run deploy:pages
```

The deploy command builds with the repository subpath and pushes only the generated `dist` site to `gh-pages`.

## Data workflows

```sh
python scripts/download/download_osm.py --dry-run
python scripts/download/download_osm.py
python scripts/process/process_osm.py
python scripts/download/download_dem.py
python scripts/process/terrain_placeholder.py
```

The app currently uses `data/osm/afton.osm`, the supplied 4.37 MB OSM XML extract. Run `python scripts/process/process_osm.py data/osm/afton.osm` to regenerate canonical GeoJSON at `data/processed/afton.geojson` and the Vite-served copy at `public/data/processed/afton.geojson`. The Overpass downloader can refresh a smaller tagged extract to `data/osm/afton.osm.json`; pass that file to the same processor when using JSON. Current OSM features are visible only in the Today era, not represented as historic evidence. The DEM script writes workflow metadata under `data/dem/`; `--check-point` makes an optional USGS service request. Review ODbL attribution and license terms before redistributing source data.

## Folder layout

```text
data/
  dem/                 USGS acquisition notes and future elevation rasters
  historic/            Verified historical source data (sites.json is empty until research)
  osm/                 OpenStreetMap extracts
  photos/              Archival photographs and rights/credit metadata
  processed/           Normalized and optimized web-ready data
public/
  audio/ images/ models/ textures/
scripts/
  download/             OSM and USGS acquisition workflows
  process/              Terrain processing scaffold
  export/               Future data export workflow
src/
  data/                 Client-side data adapters
  layers/               LayerManager and OSM-derived map layers
  scene/                Renderer, lighting, and camera controls
  timeline/             EraManager and transition state
  tours/                 SiteManager and future tours
  ui/                    Era switcher and application styling
```

## Architecture

- `LayerManager` registers named Three.js groups and owns their visibility and removal.
- `EraManager` validates supported eras and emits a `change` event for scene and UI consumers.
- `SiteManager` stores source-reviewed historical place records and builds era-aware map markers; the catalog is currently empty.
- `SceneManager` owns the renderer, camera, lighting, resize lifecycle, and render state.
- `MapTilerBasemap` loads MapTiler street tiles and maps them to the scene ground plane.
- `OSMFeatureLayers` renders local GeoJSON roads, building footprints, water, land use, and tagged places.

Historical site records use `id`, `name`, `description`, `lat`, `lon`, `era`, `images`, and `audio`. No sample historic records are included; add only researched and source-attributed entries.

## Development roadmap

1. Validate and expand the current OSM extract extent and align vector layers with the reviewed basemap.
2. Add USGS DEM download, reprojection, terrain mesh generation, and geographic alignment.
3. Ingest georeferenced historic plat maps and build opacity-controlled overlay layers.
4. Create a source-reviewed site catalog with archival photographs, captions, and audio narration.
5. Add guided flythrough tours, accessible narration controls, and timeline animation between eras.
6. Develop building morphing between eras and validate the complete experience with community reviewers.
7. Optimize rendering, mobile interaction, accessibility, data provenance, and hosting for production.
