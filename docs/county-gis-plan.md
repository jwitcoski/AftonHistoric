# Plan: County landing map, tour scenes and Washington County GIS data

## Experience

1. **County landing page (2D map).** A 2D map of Washington County with a long-form history text beside or below it. Sources: [Wikipedia, Washington County, Minnesota](https://en.wikipedia.org/wiki/Washington_County,_Minnesota) and other sources (to be listed, with licenses). The map offers every layer of every service in the GISViewer folder (`AddressPoints`, `Boundaries`, `Cadastral2`, `Cadastral_PV`, `Elections`, `Elevation`, `Facilities`, `Parcels`, `ParksRec`, `Streets`, `Terrain`, `Transportation`, `Water`) in a grouped layer panel, with the layer list read from each service's `?f=json` at load.
2. **Two scene markers on the map.**
   - Afton Old Village Tour: the existing clay scene, live.
   - Valley Creek Tour: shown as "Coming soon", not clickable.
3. **Enter the tour.** Clicking Afton transitions from the 2D map into the 3D clay scene.
4. **Tour with era switching.**
   - Intro: narration about Afton, in the scene's current state.
   - Stop 1 (Congregational Church / Memorial Hall): switch to 1855.
   - Stop 2: stay in 1855.
   - Stop 3 (Citizens State Bank, built 1913): switch to 1971 (nearest available era; no 1913 era exists).
   - Later stops switch back to 1855 or 1971 as the story requires. Each stop declares its era.

### 1855 era rules
- Cars are replaced by horses.
- Only the main street and the buildings on it exist; everything else is hidden. Main street is **St Croix Trail S** (the St. Croix Scenic Byway; OSM "Saint Croix Trail South", CH 21). Buildings on it are those fronting this road.

### Open content decisions
- Final era per stop (1855, 1971 or Today) for all 10 stops.
- Which buildings count as "main street" in 1855: those fronting St Croix Trail S. Three Old Village sites are off it (Emil Asp Blacksmith Shop on 36th St S, Afton Village School on 34th St S, Town Square Park at 34th St); confirm whether they show in 1855 when they are tour stops.
- Whether 1971 gets its own building set. Vehicles: 1971 keeps the current cars for this build; real 1970s car models replace the 2020s ones in a later phase.

## Reference

The Stillwater History Map Viewer style (aerial basemap, outlined historic areas, serif labels, camera markers) is the target look for the county 2D map.

## Data: county GIS services

Source: `https://maps.co.washington.mn.us/arcgis/rest/services/GISViewer/<Service>/MapServer`

- Layers are fetched at build time as GeoJSON in lon/lat (`outSR=4326`), per area, so the site runs on static hosting with no CORS or proxy risk.
- The county has **no building footprint layer**. OSM stays the source for buildings, landuse, places and historic sites.

| Use | Service / layer |
|---|---|
| Roads | `Streets/0` |
| Water | `Water/1` (lines), `2` (DNR protected waters); `Water/0` and its children are annotation text, not geometry |
| Parcels, owner, parcel ID | `Parcels/0` |
| Parks and trails | `ParksRec/1`, `0` |
| Facilities (points) | `Facilities/0` |
| Addresses (points) | `AddressPoints/0` |
| Lidar contours (2012 DNR) | `Elevation/0` (visible at 1:24,000 or closer) |
| Historic parcels and plats (overlays) | `Cadastral_PV/21`, `22` (attributes unverified) |
| County map: boundaries | `Boundaries/1` (county), `0` (municipals) |

The table above is what the tour scenes use. The county landing map is separate and uses all services (see below).

### County landing map layers

- Every GISViewer service is added as a toggleable group, with each of its layers as a child toggle, built from the service metadata. Default-visible layers follow the county's `defaultVisibility`; layers with a `minScale` appear only when zoomed in that far.
- Rendering is live, using the MapServer `export` image endpoint (or the `Terrain` tile cache) as raster overlays. Images load without CORS, so this needs no proxy. Feature queries (click to identify) use `query` and need CORS, so identify is a later check.
- `Terrain` is a basemap in wkid 102692, so it is offered as a basemap choice and not as an overlay. The rest are overlays in Web Mercator.
- `Elections` has not been inspected yet; its layers are read at load like the others.

## Work breakdown

1. **Tour registry.** `data/historic/tours.json` with tour id, status (`live` or `coming-soon`), sites (each with an `era`), and a padded bbox. Valley Creek has no sites yet.
2. **County fetcher.** `scripts/download/download_county.py` queries the layers above per tour bbox into `data/county/<tour>/`, plus county and municipal boundaries for the landing map.
3. **Export.** Extend `scripts/export/export_clay_city.py` to write one scene folder per tour. County roads, water and parks replace the OSM versions, and parcels, addresses, contours and plats are added. *(depends on 2)*
4. **Landing page and routing.** Add the 2D map (all GISViewer layers in a grouped panel, the two markers) and the history text. Add a route or state that opens a tour by id. *(depends on 1)*
5. **Scene by tour id.** Parametrize `mountAftonHistoricMap` in `src/clay/afton-historic.js`, which currently uses a hardcoded `SCENE_BASE`. *(depends on 3)*
6. **Era system.** Implement `EraManager` and `SiteManager` (currently TODO stubs) so each stop sets an era. The 1855 era hides all vector and building layers except the main street, and swaps cars for horses. Add a transition between eras. *(depends on 5)*
7. **Tour driver.** Add a tour controller (`src/tours/`) with intro, 10 stops, camera moves, era per stop, and play, pause and transcript controls. Wire it to the existing "Take Afton's Old Village tour" button. *(depends on 6)*
8. **Layers and linking.** Add toggles for parcels, contours, plats and addresses, and tag each site with its parcel in the site popup. *(parallel with 7)*
9. **Attribution.** Add the county data, DNR lidar and Wikipedia (CC BY-SA) credits.

## Sprint plan

Sprints are ordered, with no durations. Each ends with something demonstrable. The bid schedule puts Old Village build work in Dec 2026 to Mar 2027 and Valley Creek in Mar to Jun 2027, so sprints 0 to 4 target Old Village and sprint 5 is the Valley Creek placeholder.

| Sprint | Goal | Work breakdown steps | Demo / exit check |
|---|---|---|---|
| 0. Decisions | Unblock content questions | Open questions 1 to 4 | Era per stop, 1855 main-street building list, and basemap choice recorded in `data/historic/tours.json` notes |
| 1. Data foundation | Tour data on disk | 1, 2 | `tours.json` valid; each fetched layer returns a non-zero count for the Old Village bbox; `HistoricParcels` and `Plats` attributes inspected |
| 2. Scene by tour | County data in the existing clay scene | 3, 5, 9 (credits) | Old Village scene loads by tour id with county roads, water and parks; parcels line up with the 10 site markers |
| 3. Eras | 1855 and 1971 states | 6 | Switching era hides non-main-street buildings and swaps cars for horses; transition runs without errors |
| 4. Tour | Guided Old Village tour | 7, 8 | Full walk-through: intro, 10 stops, correct era per stop, parcel info in popups, play, pause and transcript work |
| 5. Landing page | County map and entry | 4, 9 (Wikipedia credit) | County 2D map with all GISViewer layers, history text, Afton marker opens the tour, Valley Creek shows "Coming soon" |
| 6. Valley Creek | Content and scene | Reuse 1 to 8 with Valley Creek data | Blocked until the site list and area exist; starts after sprint 0 answers for Valley Creek |

Rules for every sprint:
- Follow the Ponytail rules in `.github/copilot-instructions.md`: reuse existing code and add no new dependency unless needed.
- Non-trivial logic leaves one small runnable check (for example a script that asserts layer counts).
- The existing `?debug` view stays working at each sprint end.

## Verification

1. Each fetched layer returns a non-zero feature count for the Old Village bbox.
2. County roads and parcels line up with the 10 site markers and the OSM buildings.
3. The Valley Creek marker is visibly "Coming soon" and can't be activated.
4. Walk the tour: stop 1 switches to 1855 (horses, main street only), stop 3 switches to 1971, and the era returns correctly afterward.

## Sprint 2 findings

- `scripts/export/export_county_vectors.py` writes the county layers in the scene's local frame and points the manifest `roads` at county streets (CFCC `A31` secondary, `A41` and `A61` residential, other roads driveways); the OSM roads stay available as `roads_osm`.
- County water is not a replacement: `Water/1` is creek divide linework and `Water/2` is label polygons, so OSM water stays. County parks (3) are exported but not drawn, since OSM already has the park landuse.
- `scripts/export/check_county_alignment.py` passes: all 10 sites sit on a county parcel and within 40 m of a county road.
- `mountAftonHistoricMap(sceneDir)` takes the scene folder, defaulting to `afton-clay`.

## Open questions

1. Valley Creek site list and area, needed before its bbox and content can be defined.
2. Final era per stop and the 1855 main-street building list.
3. ~~`HistoricParcels` and `Plats` attributes~~ Answered in sprint 1: `HistoricParcels` has only `PIN` (15 in the Old Village bbox, no dates). `Plats` has plat name, recorded date and a PDF link (`Plat_Link`), 5 in the bbox, so plats are links, not georeferenced images.
5. ~~Privacy~~ Done: county `Parcels` include owner names, mailing addresses, sale and value data. The fetcher keeps only an allowlist of property fields (`PARCEL_FIELDS`), and `data/county/` was checked for leftover owner fields.
4. Basemap for the county 2D map: tiles from a free provider, or the county `Terrain` cache.
