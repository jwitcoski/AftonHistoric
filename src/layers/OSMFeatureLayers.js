import * as THREE from 'three';
import aftonArea from '../../data/afton-area.json';

const METERS_PER_DEGREE_LAT = 111_000;
const METERS_PER_DEGREE_LON = 79_500;

function project([longitude, latitude], elevation = 5) {
  return new THREE.Vector3(
    (longitude - aftonArea.center.lon) * METERS_PER_DEGREE_LON,
    elevation,
    -(latitude - aftonArea.center.lat) * METERS_PER_DEGREE_LAT,
  );
}

function featureKind(feature) {
  const tags = feature.properties ?? {};
  if (tags.highway) return 'roads';
  if (tags.building) return 'buildings';
  if (tags.waterway || tags.natural === 'water') return 'water';
  if (feature.geometry?.type === 'Point' && (tags.amenity || tags.historic || tags.tourism)) return 'places';
  if (tags.landuse || tags.leisure || tags.natural) return 'landuse';
  return null;
}

function makeLine(feature, color, width, sampleElevation) {
  const positions = feature.geometry.coordinates.map((coordinate) => project(coordinate, sampleElevation(...coordinate)));
  if (positions.length < 2) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, linewidth: width }));
}

function makePolygon(feature, color, sampleElevation) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [];
  const group = new THREE.Group();
  const river = String(feature.properties?.osm_id) === '272005' || feature.properties?.name === 'Saint Croix River';
  const material = new THREE.MeshBasicMaterial({
    color: river ? '#168fd0' : color,
    side: THREE.DoubleSide,
    transparent: !river,
    opacity: river ? 1 : 0.82,
    polygonOffset: river,
    polygonOffsetFactor: river ? -2 : 0,
    polygonOffsetUnits: river ? -2 : 0,
  });
  for (const rings of polygons) {
    const [outer, ...holes] = rings;
    if (!outer || outer.length < 4) continue;
    const appendRing = (ring, PathType) => {
      const path = new PathType();
      ring.forEach(([longitude, latitude], index) => {
        const position = project([longitude, latitude]);
        if (index === 0) path.moveTo(position.x, -position.z);
        else path.lineTo(position.x, -position.z);
      });
      path.closePath();
      return path;
    };
    const shape = appendRing(outer, THREE.Shape);
    holes.forEach((hole) => {
      if (hole.length >= 4) shape.holes.push(appendRing(hole, THREE.Path));
    });
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = river ? 6 : 5;
    group.add(mesh);
  }
  if (!group.children.length) return null;
  return group;
}

function makePlace(feature, sampleElevation) {
  const [longitude, latitude] = feature.geometry.coordinates;
  const position = project([longitude, latitude], sampleElevation(longitude, latitude));
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(5, 10, 8),
    new THREE.MeshBasicMaterial({ color: '#a95036' }),
  );
  marker.position.copy(position);
  marker.userData.tags = feature.properties;
  return marker;
}

function lineParts(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function routePose(route, distance) {
  const target = THREE.MathUtils.clamp(distance, 0, route.length);
  let index = 1;
  while (index < route.cumulative.length - 1 && route.cumulative[index] < target) index += 1;
  const start = route.cumulative[index - 1];
  const end = route.cumulative[index];
  const t = THREE.MathUtils.clamp((target - start) / Math.max(0.001, end - start), 0, 1);
  const a = route.points[index - 1];
  const b = route.points[index];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: Math.atan2(-(b.z - a.z), b.x - a.x),
  };
}

function addRoadVehicles(group, featureCollection, sampleElevation) {
  const vehicleRoads = new Set(['primary', 'secondary', 'tertiary', 'residential', 'unclassified']);
  const bodyGeometry = new THREE.BoxGeometry(6.2, 1.25, 2.6);
  const cabinGeometry = new THREE.BoxGeometry(3.1, 1.2, 2.1);
  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 8);
  wheelGeometry.rotateX(Math.PI / 2);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x252a2b });
  const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x40535a, emissive: 0x11191b });
  const bodyMaterials = [0xe05235, 0x1686a0, 0xe7ad32, 0x426b48, 0xe6e0d2].map((color) =>
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
  const routes = [];
  const maxVehicles = 24;
  const villageRadius = 650;
  const sampleStep = 16;

  const saveRoute = (points, roadId) => {
    if (points.length < 2) return;
    const cumulative = [0];
    let centerDistance = Infinity;
    for (let index = 1; index < points.length; index += 1) {
      cumulative.push(cumulative[index - 1] + Math.hypot(points[index].x - points[index - 1].x, points[index].z - points[index - 1].z));
    }
    const length = cumulative[cumulative.length - 1];
    if (length < 55) return;
    for (const point of points) centerDistance = Math.min(centerDistance, Math.hypot(point.x, point.z));
    routes.push({ points, cumulative, length, centerDistance, roadId });
  };

  for (const feature of featureCollection.features ?? []) {
    if (!vehicleRoads.has(String(feature.properties?.highway ?? ''))) continue;
    for (const coordinates of lineParts(feature.geometry)) {
      let points = [];
      for (let index = 1; index < coordinates.length; index += 1) {
        const [startLon, startLat] = coordinates[index - 1];
        const [endLon, endLat] = coordinates[index];
        const start = {
          x: (startLon - aftonArea.center.lon) * METERS_PER_DEGREE_LON,
          z: -(startLat - aftonArea.center.lat) * METERS_PER_DEGREE_LAT,
        };
        const end = {
          x: (endLon - aftonArea.center.lon) * METERS_PER_DEGREE_LON,
          z: -(endLat - aftonArea.center.lat) * METERS_PER_DEGREE_LAT,
        };
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const segmentLength = Math.hypot(dx, dz);
        if (segmentLength < 0.1) continue;
        const steps = Math.max(1, Math.ceil(segmentLength / sampleStep));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const point = { x: start.x + dx * t, z: start.z + dz * t };
          if (Math.hypot(point.x, point.z) > villageRadius) {
            saveRoute(points, feature.id ?? feature.properties?.osm_id ?? null);
            points = [];
            continue;
          }
          const previous = points[points.length - 1];
          if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > 1) points.push(point);
        }
      }
      saveRoute(points, feature.id ?? feature.properties?.osm_id ?? null);
    }
  }

  routes.sort((a, b) => a.centerDistance - b.centerDistance);
  const vehicles = [];
  const elevationAt = (x, z) => sampleElevation(
    aftonArea.center.lon + x / METERS_PER_DEGREE_LON,
    aftonArea.center.lat - z / METERS_PER_DEGREE_LAT,
  );

  for (const route of routes) {
    const spacing = route.centerDistance < 250 ? 115 : 180;
    for (let distance = 36; distance < route.length && vehicles.length < maxVehicles; distance += spacing) {
      const pose = routePose(route, distance);
      if (vehicles.some((vehicle) => Math.hypot(vehicle.x - pose.x, vehicle.z - pose.z) < 80)) continue;
      const index = vehicles.length;
      const car = new THREE.Group();
      const body = new THREE.Mesh(bodyGeometry, bodyMaterials[index % bodyMaterials.length]);
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
      car.scale.setScalar(1.5);
      car.position.set(pose.x, elevationAt(pose.x, pose.z) + 0.3, pose.z);
      car.rotation.y = pose.yaw + (index % 2 ? Math.PI : 0);
      car.userData.osmRoad = route.roadId;
      group.add(car);
      vehicles.push({ x: pose.x, z: pose.z, route, distance, direction: index % 2 ? -1 : 1, speed: 7 + (index % 3) * 1.2, mesh: car });
    }
    if (vehicles.length >= maxVehicles) break;
  }

  const update = (deltaSeconds) => {
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
      vehicle.mesh.position.set(pose.x, elevationAt(pose.x, pose.z) + 0.3, pose.z);
      vehicle.mesh.rotation.y = pose.yaw + (vehicle.direction < 0 ? Math.PI : 0);
    }
  };

  return { count: vehicles.length, update };
}

export function createOSMFeatureLayers(scene, layerManager, featureCollection, sampleElevation = () => 5) {
  const groups = Object.fromEntries(['roads', 'buildings', 'water', 'landuse', 'places', 'cars'].map((name) => [name, new THREE.Group()]));
  const styles = {
    roads: { color: '#776d5f', width: 2 },
    buildings: '#927f65',
    water: { color: '#6a9da1', width: 3 },
    landuse: '#6c8969',
  };

  for (const feature of featureCollection.features ?? []) {
    const kind = featureKind(feature);
    const group = groups[kind];
    if (!group) continue;
    let object;
    if (kind === 'roads' || (kind === 'water' && feature.geometry.type === 'LineString')) {
      object = makeLine(feature, styles[kind].color, styles[kind].width, sampleElevation);
    } else if (kind === 'buildings' || kind === 'landuse' || (kind === 'water' && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))) {
      const color = kind === 'buildings' ? styles.buildings : kind === 'water' ? '#75a8ac' : '#809478';
      object = makePolygon(feature, color, sampleElevation);
    } else if (kind === 'places' && feature.geometry.type === 'Point') {
      object = makePlace(feature, sampleElevation);
    }
    if (object) {
      object.userData.osm = true;
      object.userData.tags = feature.properties;
      group.add(object);
    }
  }

  groups.cars.name = 'afton-osm-road-cars';
  const vehicles = addRoadVehicles(groups.cars, featureCollection, sampleElevation);
  for (const [name, group] of Object.entries(groups)) {
    scene.add(group);
    layerManager.registerLayer(name, group);
  }
  return {
    counts: { ...Object.fromEntries(Object.entries(groups).map(([name, group]) => [name, group.children.length])), cars: vehicles.count },
    update: vehicles.update,
  };
}

export async function loadOSMFeatureLayers(scene, layerManager, sampleElevation = () => 5, url = '/data/processed/afton.geojson') {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const featureCollection = await response.json();
    if (featureCollection.type !== 'FeatureCollection') throw new Error('Expected a GeoJSON FeatureCollection');
    return createOSMFeatureLayers(scene, layerManager, featureCollection, sampleElevation);
  } catch (error) {
    console.info(`No processed OSM extract loaded (${error.message}). Run scripts/download/download_osm.py and scripts/process/process_osm.py.`);
    return createOSMFeatureLayers(scene, layerManager, { type: 'FeatureCollection', features: [] }, sampleElevation);
  }
}