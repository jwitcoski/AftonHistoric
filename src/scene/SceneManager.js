import * as THREE from 'three';
import { createLighting } from './Lighting.js';
import { CameraController } from './CameraController.js';

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d9e5e3');
    this.scene.fog = new THREE.Fog('#d9e5e3', 1900, 4500);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 8000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.className = 'map-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.lighting = createLighting(this.scene);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  render() {
    this.cameraController.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.cameraController.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
