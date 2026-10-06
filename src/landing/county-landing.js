import L from "leaflet";
import "leaflet/dist/leaflet.css";

const COUNTY = "https://maps.co.washington.mn.us/arcgis/rest/services/GISViewer";
const USGS = "https://basemap.nationalmap.gov/arcgis/rest/services";
const AFTON = [44.8995, -92.7835];
const COUNTY_BOUNDARY_LAYER = 1;

// Always on, so it is drawn as a thick vector outline instead of a toggle.
async function addCountyBoundary(map) {
  const geojson = await getJson(`${COUNTY}/Boundaries/MapServer/${COUNTY_BOUNDARY_LAYER}/query?where=1%3D1&outFields=&outSR=4326&f=geojson`);
  const casing = L.geoJSON(geojson, { style: { color: "#fff7e8", weight: 11, opacity: 0.9, lineJoin: "round" }, interactive: false }).addTo(map);
  L.geoJSON(geojson, { style: { color: "#b75e40", weight: 6, opacity: 1, lineJoin: "round" }, interactive: false }).addTo(map);
  map.fitBounds(casing.getBounds(), { padding: [20, 20] });
}

// ArcGIS MapServer layers drawn as Web Mercator export images, one request per tile.
const ArcGisLayers = L.TileLayer.extend({
  initialize(service, ids, options) {
    L.TileLayer.prototype.initialize.call(this, "", options);
    this._service = service;
    this._ids = ids;
  },
  getTileUrl(coords) {
    const crs = this._map.options.crs;
    const bounds = this._tileCoordsToBounds(coords);
    const sw = crs.project(bounds.getSouthWest());
    const ne = crs.project(bounds.getNorthEast());
    return `${COUNTY}/${this._service}/MapServer/export?bbox=${sw.x},${sw.y},${ne.x},${ne.y}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&layers=show:${this._ids.join(",")}&f=image`;
  },
});

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function buildLayerPanel(map, panel) {
  const folder = await getJson(`${COUNTY}?f=json`);
  const services = await Promise.all(folder.services.filter((s) => s.type === "MapServer").map(async (s) => {
    const name = s.name.split("/").pop();
    const info = await getJson(`${COUNTY}/${name}/MapServer?f=json`);
    // Group layers (with sublayers) are skipped; their children are listed instead.
    return { name, layers: info.layers.filter((layer) => !layer.subLayerIds?.length && !(name === "Boundaries" && layer.id === COUNTY_BOUNDARY_LAYER)) };
  }));

  for (const { name, layers } of services.filter((service) => service.layers.length)) {
    const group = document.createElement("details");
    group.innerHTML = `<summary>${name}</summary>`;
    const shown = new Set();
    let overlay = null;
    const refresh = () => {
      if (overlay) map.removeLayer(overlay);
      overlay = shown.size ? new ArcGisLayers(name, [...shown], { opacity: 0.85 }).addTo(map) : null;
    };
    for (const layer of layers) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.addEventListener("change", () => {
        if (input.checked) shown.add(layer.id);
        else shown.delete(layer.id);
        refresh();
      });
      label.append(input, ` ${layer.name}`);
      group.append(label);
    }
    panel.append(group);
  }
}

export async function mountCountyLanding({ enterTour }) {
  const map = L.map("county-map", { center: [45.04, -92.89], zoom: 10, zoomControl: true });
  const topo = L.tileLayer(`${USGS}/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}`, {
    maxZoom: 16,
    attribution: 'Imagery &amp; topo: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS National Map</a> · Layers: Washington County, MN GIS',
  }).addTo(map);
  const plain = L.tileLayer(`${USGS}/USGSTopo/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16 });
  L.control.layers({ "Imagery + topo": topo, Topographic: plain }, {}, { position: "topright" }).addTo(map);

  L.circleMarker(AFTON, { radius: 9, color: "#fff7e8", weight: 3, fillColor: "#b75e40", fillOpacity: 1 })
    .addTo(map)
    .bindTooltip("Afton Old Village Tour", { permanent: true, direction: "right", offset: [10, 0] })
    .on("click", enterTour);

  const panel = document.querySelector("#county-layers");
  addCountyBoundary(map).catch((error) => console.error("County boundary failed to load", error));
  try {
    await buildLayerPanel(map, panel);
  } catch (error) {
    console.error("County layer list failed to load", error);
    panel.insertAdjacentHTML("beforeend", "<p>County layers are unavailable right now.</p>");
  }
}
