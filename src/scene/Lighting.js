import * as THREE from 'three';

export function createLighting(scene) {
  const hemisphere = new THREE.HemisphereLight(0xe8f0ee, 0x77705c, 2.1);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffefd8, 3.1);
  key.position.set(-420, 640, 350);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -700;
  key.shadow.camera.right = 700;
  key.shadow.camera.top = 700;
  key.shadow.camera.bottom = -700;
  key.shadow.bias = -0.00025;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xc4dbe0, 1.05);
  fill.position.set(500, 320, -480);
  scene.add(fill);
  return { hemisphere, key, fill };
}
