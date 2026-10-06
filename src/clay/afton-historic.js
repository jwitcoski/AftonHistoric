import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createOrbitController } from "./orbit-controller.js";
import { createSceneRuntime } from "./scene-runtime.js";
import { exaggerateHeights, fitTerrainRoot } from "./terrain-fit.js";
import {
  isWoodFeature,
  lineParts,
  polygonParts,
  localXZ,
} from "./math-utils.js";
import { addOsmWater } from "./water.js";
import { addTrees } from "./trees.js";
import { makeHeightGrid } from "./height-grid.js";
import { appendRibbon, meshFromPositions } from "./map-geometry.js";

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;
const HERO_SPAN = 100;
const ERA_TEXT = {
  1855: {
    title: "A river town takes root.",
    description: "Founding era · 1855",
    caption: "FOUNDING ERA · MAIN STREET ONLY · PRESENT-DAY BUILDING FOOTPRINTS",
  },
  1971: {
    title: "A community finds its voice.",
    description: "Incorporation era · 1971",
    caption: "INCORPORATION ERA · PRESENT-DAY LAYERS UNTIL 1971 SOURCES ARE ADDED",
  },
  2026: {
    title: "A living town, still unfolding.",
    description: "Afton today · modern OSM and DEM context",
    caption: "TODAY · WASHINGTON COUNTY GIS + OPENSTREETMAP + SKADI ELEVATION",
  },
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

function localPoint(coordinate, center, sample, lift = 0) {
  const { x, z } = localXZ(coordinate[0], coordinate[1], center);
  return new THREE.Vector3(x, sample(x, z) + lift, z);
}

function addRoads(parent, collection, center, sample) {
  const casingPositions = [];
  const roadPositions = [];
  for (const feature of collection?.features || []) {
    const tags = feature.properties || {};
    const highway = String(tags.highway || "");
    const width = highway === "primary" || highway === "trunk" ? 24
      : highway === "secondary" || highway === "tertiary" ? 18
        : highway === "residential" || highway === "unclassified" ? 14
          : highway === "footway" || highway === "cycleway" || highway === "path" ? 4
            : tags.service === "driveway" ? 4.2 : 6;
    for (const coordinates of lineParts(feature.geometry)) {
      const casing = coordinates.map((coordinate) => localPoint(coordinate, center, sample, 0.38));
      const fill = coordinates.map((coordinate) => localPoint(coordinate, center, sample, 0.46));
      appendRibbon(casingPositions, casing, width);
      appendRibbon(roadPositions, fill, width * 0.7);
    }
  }
  const roadGroup = new THREE.Group();
  roadGroup.name = "afton-osm-roads";
  const casing = meshFromPositions(casingPositions, new THREE.MeshLambertMaterial({ color: 0x3f4745, side: THREE.DoubleSide }));
  if (casing) {
    casing.renderOrder = 4;
    roadGroup.add(casing);
  }
  const roads = meshFromPositions(roadPositions, new THREE.MeshLambertMaterial({ color: 0xb8aa8c, side: THREE.DoubleSide }));
  if (roads) {
    roads.renderOrder = 5;
    roadGroup.add(roads);
  }
  parent.add(roadGroup);
  return roadGroup;
}

function addCars(parent, collection, center, sample, { build, maxCars = 24, name = "afton-osm-road-cars" } = {}) {
  const vehicleRoads = new Set(["primary", "secondary", "tertiary", "residential", "unclassified"]);
  const carGeometry = new THREE.BoxGeometry(6.2, 1.25, 2.6);
  const cabinGeometry = new THREE.BoxGeometry(3.1, 1.2, 2.1);
  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 8);
  wheelGeometry.rotateX(Math.PI / 2);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x252a2b });
  const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x40535a, emissive: 0x11191b });
  const bodyMaterials = [0xe05235, 0x1686a0, 0xe7ad32, 0x426b48, 0xe6e0d2].map((color) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  const cars = new THREE.Group();
  cars.name = name;
  const routes = [];
  const villageRadius = 650;
  const routeSampleStep = 16;

  const saveRoute = (points, roadId) => {
    if (points.length < 2) return;
    const cumulative = [0];
    let centerDistance = Infinity;
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
    }
    if (cumulative[cumulative.length - 1] < 55) return;
    for (const point of points) centerDistance = Math.min(centerDistance, Math.hypot(point.x, point.z));
    routes.push({ points, cumulative, length: cumulative[cumulative.length - 1], centerDistance, roadId });
  };

  for (const feature of collection?.features || []) {
    if (!vehicleRoads.has(String(feature.properties?.highway || ""))) continue;
    for (const coordinates of lineParts(feature.geometry)) {
      let points = [];
      for (let index = 1; index < coordinates.length; index += 1) {
        const a = coordinates[index - 1];
        const b = coordinates[index];
        const pa = localXZ(a[0], a[1], center);
        const pb = localXZ(b[0], b[1], center);
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const segmentLength = Math.hypot(dx, dz);
        if (segmentLength < 0.1) continue;
        const steps = Math.max(1, Math.ceil(segmentLength / routeSampleStep));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const point = { x: pa.x + dx * t, z: pa.z + dz * t };
          if (Math.hypot(point.x, point.z) > villageRadius) {
            saveRoute(points, feature.id || null);
            points = [];
            continue;
          }
          const previous = points[points.length - 1];
          if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 1) points.push(point);
        }
      }
      saveRoute(points, feature.id || null);
    }
  }

  routes.sort((a, b) => a.centerDistance - b.centerDistance);
  const vehicles = [];
  for (const route of routes) {
    const spacing = route.centerDistance < 250 ? 115 : 180;
    for (let distance = 36; distance < route.length && vehicles.length < maxCars; distance += spacing) {
      const pose = routePose(route, distance);
      if (vehicles.some((vehicle) => Math.hypot(vehicle.x - pose.x, vehicle.z - pose.z) < 80)) continue;
      const vehicle = {
        x: pose.x,
        z: pose.z,
        route,
        distance,
        direction: vehicles.length % 2 ? -1 : 1,
        speed: 7 + (vehicles.length % 3) * 1.2,
      };
      vehicle.mesh = createCar(vehicle, vehicles.length);
      cars.add(vehicle.mesh);
      vehicles.push(vehicle);
    }
    if (vehicles.length >= maxCars) break;
  }

  function buildCar(index) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(carGeometry, bodyMaterials[index % bodyMaterials.length]);
    body.position.y = 1.25;
    car.add(body);
    const cabin = new THREE.Mesh(cabinGeometry, windowMaterial);
    cabin.position.set(-0.25, 2.82, 0);
    car.add(cabin);
    for (const x of [-1.75, 1.75]) {
      for (const z of [-1.12, 1.12]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.position.set(x, 0.42, z);
        car.add(wheel);
      }
    }
    return car;
  }

  function createCar(vehicle, index) {
    const car = build ? build(index) : buildCar(index);
    car.position.set(vehicle.x, sample(vehicle.x, vehicle.z) + 0.3, vehicle.z);
    car.rotation.y = routePose(vehicle.route, vehicle.distance).yaw + (vehicle.direction < 0 ? Math.PI : 0);
    car.scale.setScalar(1.5);
    car.userData.osmRoad = vehicle.route.roadId;
    return car;
  }

  function update(deltaSeconds) {
    if (!deltaSeconds) return;
    for (const vehicle of vehicles) {
      vehicle.distance += vehicle.speed * deltaSeconds * vehicle.direction;
      if (vehicle.distance > vehicle.route.length) {
        vehicle.distance = vehicle.route.length - (vehicle.distance - vehicle.route.length);
        vehicle.direction = -1;
      } else if (vehicle.distance < 0) {
        vehicle.distance = -vehicle.distance;
        vehicle.direction = 1;
      }
      const pose = routePose(vehicle.route, vehicle.distance);
      vehicle.x = pose.x;
      vehicle.z = pose.z;
      vehicle.mesh.position.set(pose.x, sample(pose.x, pose.z) + 0.3, pose.z);
      vehicle.mesh.rotation.y = pose.yaw + (vehicle.direction < 0 ? Math.PI : 0);
    }
  }

  parent.add(cars);
  return { group: cars, count: vehicles.length, update, vehicles };
}

function routePose(route, distance) {
  const target = THREE.MathUtils.clamp(distance, 0, route.length);
  let index = 1;
  while (index < route.cumulative.length - 1 && route.cumulative[index] < target) index += 1;
  const start = route.cumulative[index - 1];
  const end = route.cumulative[index];
  const segmentLength = Math.max(0.001, end - start);
  const t = THREE.MathUtils.clamp((target - start) / segmentLength, 0, 1);
  const a = route.points[index - 1];
  const b = route.points[index];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
  };
}

function toShape(rings, center) {
  const makePath = (ring, PathType) => {
    const path = new PathType();
    ring.forEach((coordinate, index) => {
      const { x, z } = localXZ(coordinate[0], coordinate[1], center);
      if (index === 0) path.moveTo(x, -z);
      else path.lineTo(x, -z);
    });
    path.closePath();
    return path;
  };
  const [outer, ...holes] = rings;
  if (!outer?.length) return null;
  const shape = makePath(outer, THREE.Shape);
  holes.forEach((ring) => {
    if (ring.length >= 3) shape.holes.push(makePath(ring, THREE.Path));
  });
  return shape;
}

function addLanduse(parent, collection, center, sample) {
  const group = new THREE.Group();
  group.name = "afton-osm-landuse";
  const material = new THREE.MeshLambertMaterial({
    color: 0x78906f,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (const feature of collection?.features || []) {
    if (isWoodFeature(feature)) continue;
    for (const polygon of polygonParts(feature.geometry)) {
      const shape = toShape(polygon, center);
      if (!shape) continue;
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
      mesh.rotation.x = -Math.PI / 2;
      const ring = polygon[0] || [];
      const average = ring.reduce((total, coordinate) => {
        const point = localXZ(coordinate[0], coordinate[1], center);
        return total + sample(point.x, point.z);
      }, 0) / Math.max(1, ring.length);
      mesh.position.y = average + 0.12;
      group.add(mesh);
    }
  }
  parent.add(group);
  return group;
}

function addBuildings(parent, collection, center, sample) {
  const group = new THREE.Group();
  group.name = "afton-osm-buildings";
  const materials = [
    new THREE.MeshLambertMaterial({ color: 0xb7a88d }),
    new THREE.MeshLambertMaterial({ color: 0xc8bda7 }),
    new THREE.MeshLambertMaterial({ color: 0xa9987b }),
  ];
  for (const feature of collection?.features || []) {
    const tags = feature.properties || {};
    const declaredHeight = Number.parseFloat(tags.height);
    const levels = Number.parseFloat(tags["building:levels"]);
    const height = THREE.MathUtils.clamp(Number.isFinite(declaredHeight) ? declaredHeight : Number.isFinite(levels) ? levels * 3 : 6, 3, 24);
    let index = 0;
    for (const polygon of polygonParts(feature.geometry)) {
      const shape = toShape(polygon, center);
      if (!shape) continue;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
      geometry.rotateX(-Math.PI / 2);
      const ring = polygon[0] || [];
      const localCoords = ring.map((coordinate) => localXZ(coordinate[0], coordinate[1], center));
      const centerX = localCoords.reduce((sum, point) => sum + point.x, 0) / Math.max(1, localCoords.length);
      const centerZ = localCoords.reduce((sum, point) => sum + point.z, 0) / Math.max(1, localCoords.length);
      const building = new THREE.Mesh(geometry, materials[index++ % materials.length]);
      building.position.y = sample(centerX, centerZ) + 0.3;
      building.castShadow = true;
      building.receiveShadow = true;
      group.add(building);
    }
  }
  parent.add(group);
  return group;
}

function addPlaces(parent, collection, center, sample) {
  const group = new THREE.Group();
  group.name = "afton-osm-places";
  const material = new THREE.MeshLambertMaterial({ color: 0xb75e40, emissive: 0x3d170c });
  const geometry = new THREE.SphereGeometry(3.5, 10, 8);
  for (const feature of collection?.features || []) {
    if (feature.geometry?.type !== "Point") continue;
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(localPoint(feature.geometry.coordinates, center, sample, 2.2));
    marker.userData.tags = feature.properties;
    group.add(marker);
  }
  parent.add(group);
  return group;
}

function createSiteNumberTexture(number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = "#b75e40";
  context.beginPath();
  context.arc(64, 64, 58, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff7e8";
  context.lineWidth = 6;
  context.stroke();
  context.fillStyle = "#fffaf1";
  context.font = "700 62px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(number), 64, 67);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addHistoricSites(parent, collection, buildingCollection, center, sample, unitScale) {
  const group = new THREE.Group();
  group.name = "afton-historic-sites";
  const pickables = [];
  const siteTargets = [];
  const siteFeatures = [...(collection?.features || [])].sort((a, b) => a.properties.order - b.properties.order);
  const buildingById = new Map((buildingCollection?.features || []).map((feature) => [
    `${feature.properties?.osm_type}/${feature.properties?.osm_id}`,
    feature,
  ]));
  const highlightMaterial = new THREE.MeshLambertMaterial({
    color: 0xe7a64b,
    emissive: 0x8c4818,
    emissiveIntensity: 0.26,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0xfff1c2, depthTest: false });
  const pointMaterial = new THREE.MeshLambertMaterial({ color: 0xe7a64b, emissive: 0x8c4818, emissiveIntensity: 0.4 });
  const pointGeometry = new THREE.SphereGeometry(1.3, 14, 10);

  for (const feature of siteFeatures) {
    const site = feature.properties;
    let siteCenter;
    if (feature.geometry.type === "Point") {
      const coordinate = feature.geometry.coordinates;
      siteCenter = localPoint(coordinate, center, sample, 2.4);
      const marker = new THREE.Mesh(pointGeometry, pointMaterial);
      marker.position.copy(siteCenter);
      marker.userData.historicSite = site;
      group.add(marker);
      pickables.push(marker);
    } else {
      const footprintFeatures = polygonParts(feature.geometry);
      const rings = footprintFeatures[0];
      const outer = rings?.[0] || [];
      const projected = outer.map((coord) => localXZ(coord[0], coord[1], center));
      const centerX = projected.reduce((sum, point) => sum + point.x, 0) / Math.max(1, projected.length);
      const centerZ = projected.reduce((sum, point) => sum + point.z, 0) / Math.max(1, projected.length);
      const terrainY = sample(centerX, centerZ);
      const sourceBuilding = site.osm_building_feature ? buildingById.get(site.osm_building_feature) : null;
      const tags = sourceBuilding?.properties || {};
      const declaredHeight = Number.parseFloat(tags.height);
      const levels = Number.parseFloat(tags["building:levels"]);
      const buildingHeight = THREE.MathUtils.clamp(Number.isFinite(declaredHeight) ? declaredHeight : Number.isFinite(levels) ? levels * 3 : 6, 3, 24);
      siteCenter = new THREE.Vector3(centerX, terrainY + buildingHeight + 0.22, centerZ);

      for (const polygon of footprintFeatures) {
        const shape = toShape(polygon, center);
        if (!shape) continue;
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        const highlight = new THREE.Mesh(geometry, highlightMaterial);
        highlight.position.y = terrainY + buildingHeight + 0.15;
        highlight.renderOrder = 8;
        highlight.userData.historicSite = site;
        group.add(highlight);
        pickables.push(highlight);

        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial);
        outline.position.copy(highlight.position);
        outline.renderOrder = 9;
        outline.userData.historicSite = site;
        group.add(outline);
        pickables.push(outline);
      }
    }

    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createSiteNumberTexture(site.order),
      transparent: true,
      depthTest: false,
      sizeAttenuation: true,
    }));
    label.position.copy(siteCenter);
    label.position.y += 2.6;
    label.scale.set(4.2, 4.2, 1);
    label.userData.historicSite = site;
    group.add(label);
    pickables.push(label);
    siteTargets.push(label);
  }

  parent.add(group);
  return { group, pickables, siteTargets, sites: siteFeatures.map((feature) => feature.properties) };
}

const MAIN_STREET = "Saint Croix Trail South";
const MAIN_STREET_REACH = 35;
// 1855 shows only these layers; present-day layers (and cars) are hidden.
const ERA_1855_ONLY = new Set(["mainStreet", "buildings1855", "horses"]);
const ERA_1855_KEPT = new Set(["terrain", "water", "historic_sites"]);

function eraShows(layer, era) {
  if (ERA_1855_ONLY.has(layer)) return era === 1855;
  return era !== 1855 || ERA_1855_KEPT.has(layer);
}

function buildHorse() {
  const horse = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: 0x7a4a2b, flatShading: true });
  const part = (w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), coat);
    mesh.position.set(x, y, z);
    horse.add(mesh);
    return mesh;
  };
  part(3.4, 1.3, 1.1, 0, 2.3, 0);
  part(0.7, 1.7, 0.7, 1.9, 3.0, 0).rotation.z = -0.4;
  part(1.1, 0.7, 0.6, 2.7, 3.7, 0);
  for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.35]) part(0.3, 1.7, 0.3, x, 0.85, z);
  return horse;
}

// Buildings whose centroid lies within `reach` metres of a line in `roads`, plus any listed in `keepIds`.
function featuresNearRoads(collection, roads, center, reach, keepIds) {
  const segments = [];
  for (const road of roads) {
    for (const line of lineParts(road.geometry)) {
      for (let index = 1; index < line.length; index += 1) {
        segments.push([localXZ(line[index - 1][0], line[index - 1][1], center), localXZ(line[index][0], line[index][1], center)]);
      }
    }
  }
  const distance = (p, [a, b]) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  };
  return (collection?.features || []).filter((feature) => {
    if (keepIds.has(`${feature.properties?.osm_type}/${feature.properties?.osm_id}`)) return true;
    return polygonParts(feature.geometry).some((polygon) => {
      const points = (polygon[0] || []).map((c) => localXZ(c[0], c[1], center));
      const centroid = { x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length };
      return segments.some((segment) => distance(centroid, segment) <= reach);
    });
  });
}

function colorTerrain(mesh) {
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const low = new THREE.Color(0x75876d);
  const high = new THREE.Color(0xaab39b);
  const color = new THREE.Color();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    minY = Math.min(minY, position.getY(index));
    maxY = Math.max(maxY, position.getY(index));
  }
  const range = Math.max(1, maxY - minY);
  for (let index = 0; index < position.count; index += 1) {
    const height = (position.getY(index) - minY) / range;
    const slope = THREE.MathUtils.clamp(1 - Math.abs(normal.getY(index)), 0, 1);
    color.copy(low).lerp(high, height).lerp(new THREE.Color(0x59694f), slope * 0.28);
    color.toArray(colors, index * 3);
  }
  mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
}

export async function mountAftonHistoricMap(sceneDir = "afton-clay") {
  const SCENE_BASE = `${DATA_BASE}${sceneDir}/`;
  const embed = document.querySelector("#afton-map");
  const canvas = document.querySelector("#afton-canvas");
  const status = document.querySelector("#afton-status");
  const layerGroups = {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  try {
    const [manifest, gltf] = await Promise.all([
      fetchJson(`${SCENE_BASE}scene-manifest.json`),
      new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}data/terrain/terrain-mesh.glb`),
    ]);
    const vectorEntries = await Promise.all(Object.entries(manifest.vectors).filter(([name]) => name !== "roads_osm").map(async ([name, path]) => [
      name,
      await fetchJson(`${SCENE_BASE}${path}`),
    ]));
    const vectorData = Object.fromEntries(vectorEntries);
    const terrainMesh = gltf.scene.getObjectByProperty("isMesh", true);
    if (!terrainMesh) throw new Error("Terrain mesh has no renderable mesh");
    exaggerateHeights(terrainMesh, Number(manifest.terrain.height_exaggerate) || 1);
    colorTerrain(terrainMesh);
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;

    const fitted = fitTerrainRoot(terrainMesh, Number(manifest.camera?.suggested_hero_span) || HERO_SPAN);
    const root = fitted.root;
    const terrainGroup = new THREE.Group();
    terrainGroup.name = "afton-dem-terrain";
    terrainGroup.add(root);
    layerGroups.terrain = terrainGroup;

    const decor = new THREE.Group();
    decor.name = "afton-modern-osm";
    root.add(decor);
    const center = { x: fitted.center.x, z: fitted.center.z };
    const sample = makeHeightGrid(terrainMesh);
    const unitScale = Math.max(1, fitted.span / HERO_SPAN);
    addLanduse(decor, vectorData.landuse, center, sample);
    layerGroups.landuse = decor.children[decor.children.length - 1];
    const woodlandFeatures = (vectorData.landuse?.features || []).filter(isWoodFeature);
    const trees = new THREE.Group();
    trees.name = "afton-osm-woodland-trees";
    addTrees(trees, { type: "FeatureCollection", features: woodlandFeatures }, center, sample, unitScale * 0.1);
    decor.add(trees);
    layerGroups.trees = trees;
    addRoads(decor, vectorData.roads, center, sample, unitScale);
    layerGroups.roads = decor.children[decor.children.length - 1];
    const carLayer = addCars(decor, vectorData.roads, center, sample);
    layerGroups.cars = carLayer.group;
    addBuildings(decor, vectorData.buildings, center, sample);
    layerGroups.buildings = decor.children[decor.children.length - 1];
    layerGroups.water = new THREE.Group();
    layerGroups.water.name = "afton-osm-water";
    addOsmWater(layerGroups.water, vectorData.water, center, sample, unitScale);
    decor.add(layerGroups.water);
    addPlaces(decor, vectorData.places, center, sample);
    layerGroups.places = decor.children[decor.children.length - 1];
    const historicLayer = addHistoricSites(decor, vectorData.historic_sites, vectorData.buildings, center, sample, unitScale);
    layerGroups.historic_sites = historicLayer.group;

    const mainStreet = { type: "FeatureCollection", features: (vectorData.roads?.features || []).filter((f) => f.properties?.name === MAIN_STREET) };
    const siteBuildings = new Set((vectorData.historic_sites?.features || []).map((f) => f.properties?.osm_building_feature));
    const mainStreetBuildings = { type: "FeatureCollection", features: featuresNearRoads(vectorData.buildings, mainStreet.features, center, MAIN_STREET_REACH, siteBuildings) };
    addRoads(decor, mainStreet, center, sample);
    layerGroups.mainStreet = decor.children[decor.children.length - 1];
    layerGroups.mainStreet.name = "afton-1855-main-street";
    addBuildings(decor, mainStreetBuildings, center, sample);
    layerGroups.buildings1855 = decor.children[decor.children.length - 1];
    layerGroups.buildings1855.name = "afton-1855-buildings";
    const horseLayer = addCars(decor, mainStreet, center, sample, { build: buildHorse, maxCars: 6, name: "afton-1855-horses" });
    layerGroups.horses = horseLayer.group;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d7e2df");
    scene.fog = new THREE.Fog("#d7e2df", 190, 440);
    scene.add(terrainGroup);
    const hemisphere = new THREE.HemisphereLight(0xeaf1ed, 0x697363, 2.2);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffedd3, 2.4);
    sun.position.set(-150, 210, 160);
    sun.castShadow = true;
    scene.add(sun);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
    const fittedSpan = fitted.span * fitted.root.scale.x;
    const bounds = { center: new THREE.Vector3(0, 4, 0), radius: Math.max(fittedSpan * 0.62, 55) };
    const controller = createOrbitController({ camera, canvas, container: embed, renderer, getBounds: () => bounds, reduceMotion });
    const resizeObserver = new ResizeObserver(() => controller.resize());
    resizeObserver.observe(embed);
    controller.resize();
    controller.syncFromBounds();
    const debugParameters = new URLSearchParams(location.search);
    if (debugParameters.has("debug-sites") || debugParameters.has("debug")) {
      let treeInstances = 0;
      trees.traverse((child) => {
        if (child.isInstancedMesh) treeInstances = Math.max(treeInstances, child.count);
      });
      root.updateMatrixWorld(true);
      const carPositions = carLayer.group.children.map((car) => {
        const world = car.getWorldPosition(new THREE.Vector3());
        const projected = world.clone().add(new THREE.Vector3(0, 1.5, 0)).project(camera);
        return { x: world.x, y: world.y, z: world.z, screenX: projected.x, screenY: projected.y, depth: projected.z };
      });
      window.__aftonHistoricDebug = {
        camera,
        renderer,
        siteTargets: historicLayer.siteTargets,
        treeInstances,
        woodlandFeatureCount: woodlandFeatures.length,
        carCount: carLayer.count,
        carPositions,
        getCarPositions: () => carLayer.vehicles.map((vehicle) => [vehicle.mesh.position.x, vehicle.mesh.position.z]),
        getLayerVisibility: () => Object.fromEntries(Object.entries(layerGroups).map(([name, group]) => [name, group.visible])),
      };
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = null;
    let selectedSiteIndex = -1;
    let tourActive = false;
    const popup = document.querySelector("#historic-popup");
    const focusHistoricSite = (index) => {
      const target = historicLayer.siteTargets[index];
      if (!target) return;
      root.updateMatrixWorld(true);
      const point = target.getWorldPosition(new THREE.Vector3());
      controller.focus(point, historicLayer.sites[index].id === "town-square-park" ? 7 : 4);
    };
    const showHistoricSite = (index, inTour = false) => {
      const count = historicLayer.sites.length;
      if (!count) return;
      selectedSiteIndex = inTour ? THREE.MathUtils.clamp(index, 0, count - 1) : (index + count) % count;
      tourActive = inTour;
      embed.classList.toggle("is-touring", inTour);
      const site = historicLayer.sites[selectedSiteIndex];
      document.querySelector("#historic-popup-order").textContent = `SITE ${site.order} OF ${count}`;
      document.querySelector("#historic-popup-designation").textContent = site.designation;
      const tourStep = document.querySelector("#tour-step");
      tourStep.hidden = !inTour;
      tourStep.textContent = inTour ? `STOP ${String(site.order).padStart(2, "0")} / ${String(count).padStart(2, "0")}` : "";
      document.querySelector("#historic-popup-title").textContent = site.name;
      document.querySelector("#historic-popup-address").textContent = site.address;
      document.querySelector("#historic-popup-description").textContent = site.description;
      if (inTour && site.era) setEra(site.era);
      const parcel = document.querySelector("#historic-popup-parcel");
      parcel.hidden = !site.parcel_pin;
      parcel.textContent = site.parcel_pin ? `Parcel ${site.parcel_pin} · ${site.parcel_plat || "unplatted"} · Washington County GIS` : "";
      document.querySelectorAll(".popup-links a").forEach((link) => { link.hidden = false; });
      const sourceLink = document.querySelector("#historic-popup-source");
      sourceLink.href = site.sourceUrl;
      const mapLink = document.querySelector("#historic-popup-map");
      mapLink.href = site.mapUrl;
      document.querySelector("#historic-popup-prev").disabled = false;
      document.querySelector("#historic-popup-next span").textContent = inTour && selectedSiteIndex === count - 1 ? "Finish tour" : "Next stop";
      popup.hidden = false;
      focusHistoricSite(selectedSiteIndex);
    };
    // Placeholder intro copy until the HPC narration script exists.
    const showIntro = () => {
      selectedSiteIndex = -1;
      tourActive = true;
      embed.classList.add("is-touring");
      setEra(2026);
      document.querySelector("#historic-popup-order").textContent = "OLD VILLAGE TOUR";
      document.querySelector("#historic-popup-designation").textContent = "";
      const tourStep = document.querySelector("#tour-step");
      tourStep.hidden = false;
      tourStep.textContent = "INTRO";
      document.querySelector("#historic-popup-title").textContent = "Welcome to Afton";
      document.querySelector("#historic-popup-address").textContent = "St. Croix Trail South, Afton, Minnesota";
      document.querySelector("#historic-popup-description").textContent = "Afton sits on the St. Croix River in Washington County. Follow St. Croix Trail South, the village's main street, through ten historic sites. Some stops step back to 1855 or forward to 1971.";
      document.querySelector("#historic-popup-parcel").hidden = true;
      document.querySelectorAll(".popup-links a").forEach((link) => { link.hidden = true; });
      document.querySelector("#historic-popup-prev").disabled = true;
      document.querySelector("#historic-popup-next span").textContent = "First stop";
      popup.hidden = false;
      controller.reset();
    };
    const canvasPointerDown = (event) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const canvasPointerUp = (event) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) {
        pointerDown = null;
        return;
      }
      pointerDown = null;
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(historicLayer.pickables, false).find((item) => item.object.userData.historicSite);
      if (!hit) return;
      const site = hit.object.userData.historicSite;
      const index = historicLayer.sites.findIndex((candidate) => candidate.id === site.id);
      if (index >= 0) showHistoricSite(index, false);
    };
    canvas.addEventListener("pointerdown", canvasPointerDown);
    canvas.addEventListener("pointerup", canvasPointerUp);
    document.querySelector("#historic-popup-close").addEventListener("click", () => {
      popup.hidden = true;
      if (tourActive) setEra(2026);
      tourActive = false;
      embed.classList.remove("is-touring");
      controller.reset();
    });
    document.querySelector("#historic-popup-prev").addEventListener("click", () => {
      if (tourActive && selectedSiteIndex === 0) {
        showIntro();
        return;
      }
      showHistoricSite(selectedSiteIndex - 1, tourActive);
    });
    document.querySelector("#historic-popup-next").addEventListener("click", () => {
      if (tourActive && selectedSiteIndex === -1) {
        showHistoricSite(0, true);
        return;
      }
      if (tourActive && selectedSiteIndex === historicLayer.sites.length - 1) {
        popup.hidden = true;
        setEra(2026);
        tourActive = false;
        embed.classList.remove("is-touring");
        controller.reset();
        return;
      }
      showHistoricSite(selectedSiteIndex + 1, tourActive);
    });
    document.querySelector("#start-tour").addEventListener("click", showIntro);

    const eraManager = { current: 1855 };
    const setEra = (year) => {
      eraManager.current = Number(year);
      Object.entries(layerGroups).forEach(([name, group]) => {
        const input = document.querySelector(`[data-afton-layer="${name}"]`);
        group.visible = eraShows(name, eraManager.current) && (!input || input.checked);
      });
      const data = ERA_TEXT[eraManager.current];
      document.querySelector("#afton-title").textContent = data.title;
      document.querySelector("#afton-description").textContent = data.description;
      document.querySelector("#afton-caption").textContent = data.caption;
      document.querySelectorAll("[data-afton-era]").forEach((button) => {
        const active = Number(button.dataset.aftonEra) === eraManager.current;
        button.setAttribute("aria-pressed", String(active));
        button.classList.toggle("is-active", active);
      });
    };
    document.querySelectorAll("[data-afton-era]").forEach((button) => {
      button.addEventListener("click", () => setEra(button.dataset.aftonEra));
    });
    document.querySelectorAll("[data-afton-layer]").forEach((input) => {
      input.addEventListener("change", () => {
        const group = layerGroups[input.dataset.aftonLayer];
        if (group) group.visible = eraShows(input.dataset.aftonLayer, eraManager.current) && input.checked;
      });
    });
    document.querySelector("#afton-layers-toggle").addEventListener("click", () => {
      const panel = document.querySelector("#afton-layers");
      panel.hidden = !panel.hidden;
    });
    document.querySelector("#afton-reset").addEventListener("click", () => controller.reset());
    setEra(2026);

    const animations = {
      camera,
      reduceMotion,
      updateCars: (deltaSeconds) => {
        if (eraManager.current === 1855) horseLayer.update(deltaSeconds);
        else carLayer.update(deltaSeconds);
      },
    };
    let lastTime = performance.now();
    const runtime = createSceneRuntime({
      renderer,
      scene,
      controller,
      embed,
      getAnimations: () => animations,
      getLastTime: () => lastTime,
      setLastTime: (value) => { lastTime = value; },
    });
    runtime.start();
    status.textContent = `Terrain and ${Object.values(vectorData).reduce((sum, collection) => sum + (collection?.features?.length || 0), 0)} map features loaded`;
    embed.classList.add("is-ready");
    window.addEventListener("pagehide", () => {
      runtime.dispose();
      controller.dispose();
      canvas.removeEventListener("pointerdown", canvasPointerDown);
      canvas.removeEventListener("pointerup", canvasPointerUp);
      resizeObserver.disconnect();
      renderer.dispose();
    }, { once: true });
  } catch (error) {
    console.error("Afton historic scene failed to load", error);
    status.textContent = `Could not load the Afton scene: ${error.message}`;
    embed.classList.add("has-error");
  }
}