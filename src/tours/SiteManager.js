import * as THREE from 'three';
import aftonArea from '../../data/afton-area.json';
import historicSites from '../../data/historic/sites.json';

const MAP_CENTER = aftonArea.center;

function projectCoordinates(lat, lon) {
  const east = (lon - MAP_CENTER.lon) * 79_500;
  const north = (lat - MAP_CENTER.lat) * 111_000;
  return { x: east, z: -north };
}

function createLabelTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(247, 244, 231, 0.96)';
  context.beginPath();
  context.roundRect(2, 2, 508, 124, 10);
  context.fill();
  context.strokeStyle = 'rgba(59, 79, 67, 0.35)';
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = '#36473c';
  context.font = '600 38px Georgia, serif';
  context.textBaseline = 'middle';
  context.fillText(name.slice(0, 23), 24, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SiteManager {
  constructor(scene, layerManager, sites = historicSites.map((site) => ({ ...site, era: 2026, images: [], audio: [] })), sampleElevation = () => 5) {
    this.sites = new Map();
    this.markerMeshes = [];
    this.group = new THREE.Group();
    this.layerManager = layerManager;
    this.sampleElevation = sampleElevation;
    scene.add(this.group);
    this.layerManager.registerLayer('sites', this.group);
    sites.forEach((site) => this.addSite(site));
  }

  addSite(site) {
    const required = ['id', 'name', 'description', 'lat', 'lon', 'era', 'images', 'audio'];
    const missing = required.filter((key) => !(key in site));
    if (missing.length) throw new Error(`Site is missing fields: ${missing.join(', ')}`);
    if (this.sites.has(site.id)) throw new Error(`Duplicate site id: ${site.id}`);
    const normalized = { ...site, era: Number(site.era), images: [...site.images], audio: [...site.audio] };
    const position = projectCoordinates(normalized.lat, normalized.lon);
    const marker = new THREE.Group();
    marker.position.set(position.x, this.sampleElevation(normalized.lon, normalized.lat), position.z);
    marker.userData.site = normalized;

    const halo = new THREE.Mesh(new THREE.CircleGeometry(27, 32), new THREE.MeshBasicMaterial({ color: '#d7aa63', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 1;
    marker.add(halo);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(11, 18, 14), new THREE.MeshStandardMaterial({ color: '#c26843', roughness: 0.42, emissive: '#402016' }));
    pin.position.y = 28;
    pin.castShadow = true;
    pin.userData.site = normalized;
    marker.add(pin);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 5, 21, 10), new THREE.MeshStandardMaterial({ color: '#f6edd5', roughness: 0.45 }));
    stem.position.y = 15;
    marker.add(stem);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(normalized.name), transparent: true, depthTest: false }));
    label.position.set(5, 76, 0);
    label.scale.set(126, 31.5, 1);
    marker.add(label);
    marker.visible = false;
    this.group.add(marker);
    this.markerMeshes.push(pin);
    this.sites.set(normalized.id, { ...normalized, marker });
    return normalized;
  }

  getSite(id) {
    return this.sites.get(id) ?? null;
  }

  getMapPosition(id) {
    const marker = this.sites.get(id)?.marker;
    return marker ? new THREE.Vector3(marker.position.x, marker.position.y + 2, marker.position.z) : null;
  }

  getSites() {
    return [...this.sites.values()].map(({ marker, ...site }) => site);
  }

  setEra(era) {
    for (const { marker, era: siteEra } of this.sites.values()) marker.visible = siteEra <= era;
  }

  getIntersectables() {
    return this.markerMeshes;
  }

  dispose() {
    this.group.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
      object.material?.map?.dispose();
    });
  }
}
