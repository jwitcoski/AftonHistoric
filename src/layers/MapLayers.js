import * as THREE from 'three';
import { loadMapTilerTexture } from './MapTilerBasemap.js';
import aftonArea from '../../data/afton-area.json';

export function createMapLayers(scene, layerManager, mapTilerKey) {
  const terrain = new THREE.Group();
  const groundMaterial = new THREE.MeshBasicMaterial({ color: '#a8b79a' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(aftonArea.mapSizeMeters.width, aftonArea.mapSizeMeters.depth), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  ground.receiveShadow = true;
  terrain.add(ground);
  scene.add(terrain);
  layerManager.registerLayer('terrain', terrain);

  const basemapReady = loadMapTilerTexture(mapTilerKey).then((texture) => {
    if (!texture) return false;
    groundMaterial.map = texture;
    groundMaterial.color.set('#ffffff');
    groundMaterial.needsUpdate = true;
    return true;
  }).catch((error) => {
    console.warn('MapTiler basemap unavailable; no illustrative replacement is shown.', error);
    return false;
  });

  return { basemapReady };
}