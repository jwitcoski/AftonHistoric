import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import aftonArea from '../../data/afton-area.json';

const METERS_PER_DEGREE_LAT = 111_000;
const METERS_PER_DEGREE_LON = 79_500;
const NODATA = 65_535;

function loadBinary(url) {
  return fetch(url).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
    return response.arrayBuffer();
  });
}

export async function createTerrainLayer(scene, layerManager) {
  const group = new THREE.Group();
  scene.add(group);
  layerManager.registerLayer('elevation', group);

  try {
    const [gltf, terrainMetadataResponse, heightfieldMetadataResponse, binary] = await Promise.all([
      new GLTFLoader().loadAsync('/data/terrain/terrain-mesh.glb'),
      fetch('/data/terrain/terrain-metadata.json'),
      fetch('/data/terrain/heightfield-metadata.json'),
      loadBinary('/data/terrain/heightfield-u16.bin'),
    ]);
    if (!terrainMetadataResponse.ok || !heightfieldMetadataResponse.ok) {
      throw new Error('terrain metadata is missing from the public data directory');
    }
    const terrainMetadata = await terrainMetadataResponse.json();
    const heightfield = await heightfieldMetadataResponse.json();
    const origin = terrainMetadata.local_crs.local_origin;
    const originX = (origin.longitude - aftonArea.center.lon) * METERS_PER_DEGREE_LON;
    const originZ = -(origin.latitude - aftonArea.center.lat) * METERS_PER_DEGREE_LAT;
    group.position.set(originX, -terrainMetadata.elevation_min_m, originZ);
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    group.add(gltf.scene);

    const values = new DataView(binary);
    const terrainMin = terrainMetadata.elevation_min_m;
    const sampleElevation = (longitude, latitude) => {
      const east = (longitude - origin.longitude) * METERS_PER_DEGREE_LON;
      const north = (latitude - origin.latitude) * METERS_PER_DEGREE_LAT;
      const bounds = heightfield.bounds_local_m;
      const col = Math.floor((east - bounds.min_east_m) / heightfield.cell_size_m);
      const row = Math.floor((bounds.max_north_m - north) / heightfield.cell_size_m);
      if (row < 0 || col < 0 || row >= heightfield.rows || col >= heightfield.cols) return 5;
      const value = values.getUint16((row * heightfield.cols + col) * 2, true);
      if (value === NODATA) return 5;
      return heightfield.elevation_offset_m + value * heightfield.elevation_scale_m - terrainMin + 4;
    };

    return { group, sampleElevation, metadata: terrainMetadata };
  } catch (error) {
    console.info(`No generated Afton DEM terrain loaded (${error.message}). Run the DEM download and terrain processing scripts.`);
    layerManager.removeLayer('elevation');
    return { group: null, sampleElevation: () => 5, metadata: null };
  }
}