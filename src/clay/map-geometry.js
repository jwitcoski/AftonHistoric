import * as THREE from "three";
import { localXZ } from "./math-utils.js";

export function appendRibbon(positions, points, width) {
  if (!points || points.length < 2) return;
  const half = width * 0.5;
  const up = new THREE.Vector3(0, 1, 0);
  const lefts = [];
  const rights = [];
  for (let index = 0; index < points.length; index += 1) {
    let direction;
    if (index === 0) direction = new THREE.Vector3().subVectors(points[1], points[0]);
    else if (index === points.length - 1) direction = new THREE.Vector3().subVectors(points[index], points[index - 1]);
    else {
      const before = new THREE.Vector3().subVectors(points[index], points[index - 1]).normalize();
      const after = new THREE.Vector3().subVectors(points[index + 1], points[index]).normalize();
      direction = before.add(after);
    }
    if (direction.lengthSq() < 1e-8) direction.set(1, 0, 0);
    else direction.normalize();
    const side = new THREE.Vector3().crossVectors(up, direction);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    else side.normalize().multiplyScalar(half);
    lefts.push(new THREE.Vector3().subVectors(points[index], side));
    rights.push(new THREE.Vector3().addVectors(points[index], side));
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const leftA = lefts[index];
    const rightA = rights[index];
    const leftB = lefts[index + 1];
    const rightB = rights[index + 1];
    positions.push(
      leftA.x, leftA.y, leftA.z, rightA.x, rightA.y, rightA.z, rightB.x, rightB.y, rightB.z,
      leftA.x, leftA.y, leftA.z, rightB.x, rightB.y, rightB.z, leftB.x, leftB.y, leftB.z,
    );
  }
}

export function meshFromPositions(positions, material) {
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function gamePoint(east, north, center, sample, lift = 0.9) {
  const { x, z } = localXZ(east, north, center);
  const y = sample(x, z);
  if (y == null) return null;
  return new THREE.Vector3(x, y + lift, z);
}