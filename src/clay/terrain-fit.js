import * as THREE from "three";

export function exaggerateHeights(mesh, factor = 1) {
  if (!mesh?.geometry?.attributes?.position || !(factor > 0) || factor === 1) return;
  const positions = mesh.geometry.attributes.position;
  let minimum = Infinity;
  for (let index = 0; index < positions.count; index += 1) minimum = Math.min(minimum, positions.getY(index));
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, minimum + (positions.getY(index) - minimum) * factor);
  }
  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

export function fitTerrainRoot(mesh, targetSpan = 100) {
  const root = new THREE.Group();
  root.name = "afton-terrain-root";
  root.add(mesh);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  mesh.position.sub(center);
  const fittedBounds = new THREE.Box3().setFromObject(mesh);
  const size = fittedBounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1);
  root.scale.setScalar(targetSpan / span);
  root.updateMatrixWorld(true);
  return { root, center, mesh, span };
}