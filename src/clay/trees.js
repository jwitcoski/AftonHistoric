/**
 * Tree instancing and woodland distribution for 3D clay ski resort scenes.
 */

import * as THREE from "three";
import { PALETTE, MAX_TREES, TREE_SCALE } from "./config.js";
import {
  rng,
  localXZ,
  polygonParts,
  isWoodFeature,
  shoelaceArea,
  firmlyInside,
  insideIslandRing,
} from "./math-utils.js";

export function collectWoodPolygons(features) {
  const polys = [];
  for (const feature of features || []) {
    if (!isWoodFeature(feature)) continue;
    for (const poly of polygonParts(feature.geometry)) {
      const outer = poly?.[0];
      if (!outer || outer.length < 3) continue;
      const holes = (poly.slice(1) || []).filter((h) => h && h.length >= 3);
      polys.push({ outer, holes });
    }
  }
  return polys;
}

/** Grid-sample wood polygons; points stay inset in the original rings. */
export function sampleWoodUnion(polys, maxPts) {
  if (!polys?.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let area = 0;
  for (const { outer, holes } of polys) {
    for (const c of outer) {
      if (!c || c.length < 2) continue;
      minX = Math.min(minX, c[0]);
      minY = Math.min(minY, c[1]);
      maxX = Math.max(maxX, c[0]);
      maxY = Math.max(maxY, c[1]);
    }
    area += shoelaceArea(outer);
    for (const h of holes || []) area -= shoelaceArea(h);
  }
  if (!(maxX > minX) || !(maxY > minY)) return [];
  area = Math.max(area, (maxX - minX) * (maxY - minY) * 0.05);

  let step = Math.sqrt(area / Math.max(1, maxPts));
  step = Math.max(8, Math.min(28, step));
  const bboxArea = (maxX - minX) * (maxY - minY);
  if (bboxArea / (step * step) > maxPts * 14) {
    step = Math.sqrt(bboxArea / (maxPts * 8));
  }
  const margin = Math.max(2.5, step * 0.22);

  const out = [];
  const nx = Math.max(1, Math.ceil((maxX - minX) / step));
  const ny = Math.max(1, Math.ceil((maxY - minY) / step));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + (i + 0.5) * step;
      const y = minY + (j + 0.5) * step;
      for (const poly of polys) {
        if (firmlyInside(x, y, poly.outer, poly.holes, margin)) {
          out.push([x, y]);
          break;
        }
      }
    }
  }

  if (out.length <= maxPts) return out;

  const shuffled = out.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng(i * 17.23) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = [];
  const stride = shuffled.length / maxPts;
  for (let i = 0; i < maxPts; i++) {
    selected.push(shuffled[Math.min(shuffled.length - 1, Math.floor(i * stride))]);
  }
  return selected;
}

export function placeTreeInstances(positions, unitScale = 1) {
  const trunkGeo = new THREE.CylinderGeometry(0.08 * unitScale, 0.11 * unitScale, 0.55 * unitScale, 4);
  const crownGeo = new THREE.ConeGeometry(0.55 * unitScale, 1.35 * unitScale, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk });
  const crownMat = new THREE.MeshLambertMaterial({ color: PALETTE.tree, flatShading: true });
  const deepMat = new THREE.MeshLambertMaterial({ color: PALETTE.treeDeep, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, positions.length);
  const crownsDeep = new THREE.InstancedMesh(crownGeo, deepMat, positions.length);
  trunks.frustumCulled = false;
  crowns.frustumCulled = false;
  crownsDeep.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < positions.length; i++) {
    const t = positions[i];
    const sc = t.scale * TREE_SCALE;
    q.setFromAxisAngle(up, t.rot);
    p.set(t.x, t.y, t.z);
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);

    p.y = t.y + 0.85 * sc * unitScale;
    m.compose(p, q, s);
    crowns.setMatrixAt(i, m);

    p.y = t.y + 1.35 * sc * unitScale;
    s.set(sc * 0.72, sc * 0.72, sc * 0.72);
    m.compose(p, q, s);
    crownsDeep.setMatrixAt(i, m);
  }
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  crownsDeep.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "montage-trees";
  group.add(trunks, crowns, crownsDeep);
  return group;
}

export function addProceduralTrees(parent, sample, unitScale = 1) {
  const positions = [];
  for (let i = 0; i < MAX_TREES * 2 && positions.length < MAX_TREES; i++) {
    const x = -42 * unitScale + rng(i * 3.7) * 84 * unitScale;
    const z = -42 * unitScale + rng(i * 9.1) * 84 * unitScale;
    const y = sample(x, z);
    if (y == null || y < 4 * unitScale || y > 40 * unitScale) continue;
    if (rng(i * 1.3) > 0.72 && y > 28 * unitScale) continue;
    positions.push({
      x,
      y,
      z,
      rot: rng(i + 5) * Math.PI * 2,
      scale: 0.75 + rng(i + 2) * 0.65,
    });
  }
  if (!positions.length) return null;
  const group = placeTreeInstances(positions, unitScale);
  parent.add(group);
  return group;
}

export function addTrees(parent, featureCollection, center, sample, unitScale = 1, clipRing = null) {
  const features = featureCollection?.features || [];
  if (!features.length) return null;

  const woodPolys = collectWoodPolygons(features);
  let coords = sampleWoodUnion(woodPolys, MAX_TREES);

  /* Fallback: individual tree points only when no wood/forest polygons exist. */
  if (!coords.length) {
    coords = [];
    for (const feature of features) {
      const geom = feature.geometry;
      if (geom?.type === "Point" && geom.coordinates?.length >= 2) coords.push(geom.coordinates);
      else if (geom?.type === "MultiPoint") {
        for (const c of geom.coordinates || []) {
          if (c?.length >= 2) coords.push(c);
        }
      }
    }
    if (coords.length > MAX_TREES) {
      const stride = coords.length / MAX_TREES;
      const sourcePoints = [];
      for (let i = 0; i < MAX_TREES; i++) {
        sourcePoints.push(coords[Math.min(coords.length - 1, Math.floor(i * stride))]);
      }
      coords = sourcePoints;
    }
  }

  const positions = [];
  for (let i = 0; i < coords.length && positions.length < MAX_TREES; i++) {
    const coord = coords[i];
    const { x, z } = localXZ(coord[0], coord[1], center);
    if (clipRing?.length && !insideIslandRing(x, z, clipRing)) continue;
    const y = sample(x, z);
    if (y == null) continue;
    positions.push({
      x,
      y,
      z,
      rot: rng(i * 5.1) * Math.PI * 2,
      scale: 0.8 + rng(i * 2.3) * 0.55,
    });
  }

  if (!positions.length) return null;
  const group = placeTreeInstances(positions.slice(0, MAX_TREES), unitScale);
  parent.add(group);
  return group;
}
