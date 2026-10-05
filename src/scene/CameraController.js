import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gsap } from 'gsap';
import * as THREE from 'three';

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 55;
    this.controls.maxDistance = 1800;
    this.controls.minPolarAngle = 0.38;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.enablePan = true;
    this.controls.target.set(0, 0, 0);
    this.homePosition = new THREE.Vector3(860, 880, 920);
    this.reset();
  }

  reset() {
    gsap.to(this.camera.position, { x: this.homePosition.x, y: this.homePosition.y, z: this.homePosition.z, duration: 0.8, ease: 'power2.inOut' });
    gsap.to(this.controls.target, { x: 0, y: 0, z: 0, duration: 0.8, ease: 'power2.inOut', onUpdate: () => this.controls.update() });
  }

  zoomBy(factor) {
    const direction = this.camera.position.clone().sub(this.controls.target);
    direction.multiplyScalar(factor).clampLength(this.controls.minDistance, this.controls.maxDistance);
    gsap.to(this.camera.position, { x: this.controls.target.x + direction.x, y: this.controls.target.y + direction.y, z: this.controls.target.z + direction.z, duration: 0.35, ease: 'power2.out' });
  }

  focusOn(point, distance = 150) {
    const offset = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(distance);
    const cameraPosition = point.clone().add(offset);
    gsap.killTweensOf(this.camera.position);
    gsap.killTweensOf(this.controls.target);
    gsap.to(this.camera.position, {
      x: cameraPosition.x,
      y: cameraPosition.y,
      z: cameraPosition.z,
      duration: 1.1,
      ease: 'power2.inOut',
    });
    gsap.to(this.controls.target, {
      x: point.x,
      y: point.y,
      z: point.z,
      duration: 1.1,
      ease: 'power2.inOut',
    });
  }

  update() {
    this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
