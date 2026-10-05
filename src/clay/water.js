/**
 * Lake carving, pond placement, and OSM water polygon draping for 3D clay ski resort scenes.
 */

import * as THREE from "three";
import { PALETTE, TRAIL_WIDTH } from "./config.js";
import {
  localXZ,
  lineParts,
  polygonParts,
  downsampleLine,
  clipPointRuns,
  insideIslandRing,
} from "./math-utils.js";
import { shadeSnowMesh } from "./height-grid.js";
import { appendRibbon, meshFromPositions, gamePoint } from "./map-geometry.js";

/** Carve a flat bowl into the terrain so a pond reads clearly. */
export function carveWaterBowl(mesh, cx, cz, radius, depth) {
  const pos = mesh.geometry.attributes.position;
  const ox = mesh.position.x;
  const oy = mesh.position.y;
  const oz = mesh.position.z;
  const r2 = radius * radius;
  let bedY = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    const t = 1 - Math.sqrt(d2) / radius;
    const y = pos.getY(i);
    const target = y - depth * t * t;
    pos.setY(i, target);
    bedY = Math.min(bedY, target + oy);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  shadeSnowMesh(mesh);
  return Number.isFinite(bedY) ? bedY : null;
}

export function findWaterSite(sample, span, clipRing = null) {
  const half = span * 0.32;
  let best = null;
  const step = Math.max(4, span / 28);
  for (let z = -half; z <= half; z += step) {
    for (let x = -half; x <= half; x += step) {
      if (clipRing?.length && !insideIslandRing(x, z, clipRing)) continue;
      const y = sample(x, z);
      if (y == null) continue;
      /* Prefer a mid-slope bowl, not the absolute ski-area edge. */
      const score = y + Math.hypot(x, z) * 0.08;
      if (!best || score < best.score) best = { x, z, y, score };
    }
  }
  return best;
}

export function addWaterDisc(parent, x, z, y, radius) {
  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.water,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, y, z);
  disc.name = "montage-water";
  disc.renderOrder = 2;
  disc.frustumCulled = false;
  parent.add(disc);
  return disc;
}

export function waterFeatureCount(fc) {
  return fc?.features?.length || 0;
}

/** Drape OSM water polygons + stream ribbons onto the clay terrain. */
export function addOsmWater(parent, featureCollection, center, sample, unitScale = 1, clipRing = null) {
  const features = featureCollection?.features || [];
  if (!features.length) return null;

  const group = new THREE.Group();
  group.name = "montage-water-osm";
  const fillLift = Math.max(0.25, 0.06 * unitScale);
  const lineLift = Math.max(0.35, 0.08 * unitScale);
  const lineWidth = Math.max(0.35, TRAIL_WIDTH * 0.85 * Math.min(2.2, unitScale * 0.12));

  const fillMat = new THREE.MeshLambertMaterial({
    color: PALETTE.water,
    emissive: PALETTE.waterEm,
    emissiveIntensity: 0.22,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const lineMat = new THREE.MeshLambertMaterial({
    color: PALETTE.water,
    emissive: PALETTE.waterEm,
    emissiveIntensity: 0.28,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });

  const lineRibbons = [];
  let added = 0;

  for (const feature of features) {
    for (const poly of polygonParts(feature.geometry)) {
      const outer = poly?.[0];
      if (!outer || outer.length < 3) continue;
      const dens = downsampleLine(outer, 48);
      const shapePts = [];
      for (const coord of dens) {
        const { x, z } = localXZ(coord[0], coord[1], center);
        if (clipRing?.length && !insideIslandRing(x, z, clipRing)) continue;
        shapePts.push(new THREE.Vector2(x, z));
      }
      if (shapePts.length < 3) continue;
      const shape = new THREE.Shape(shapePts);
      for (const hole of poly.slice(1) || []) {
        if (!hole || hole.length < 3) continue;
        const holePts = [];
        for (const coord of downsampleLine(hole, 24)) {
          const { x, z } = localXZ(coord[0], coord[1], center);
          holePts.push(new THREE.Vector2(x, z));
        }
        if (holePts.length >= 3) shape.holes.push(new THREE.Path(holePts));
      }
      let geo;
      try {
        geo = new THREE.ShapeGeometry(shape);
      } catch {
        continue;
      }
      const pos = geo.attributes.position;
      if (!pos || pos.count < 3) {
        geo.dispose();
        continue;
      }
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getY(i);
        const y = sample(x, z);
        pos.setXYZ(i, x, (y == null ? 0 : y) + fillLift, z);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, fillMat);
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      group.add(mesh);
      added += 1;
    }

    for (const coords of lineParts(feature.geometry)) {
      const pts = [];
      for (const coord of downsampleLine(coords, 64)) {
        const p = gamePoint(coord[0], coord[1], center, sample, lineLift);
        if (p) pts.push(p);
      }
      for (const run of clipPointRuns(pts, clipRing)) {
        appendRibbon(lineRibbons, run, lineWidth);
      }
    }
  }

  if (lineRibbons.length) {
    const mesh = meshFromPositions(lineRibbons, lineMat);
    if (mesh) {
      mesh.renderOrder = 2;
      group.add(mesh);
      added += 1;
    }
  }

  if (!added) return null;
  parent.add(group);
  return group;
}

export function prepareWaterFeature(mesh, sample, span, clipRing = null) {
  const site = findWaterSite(sample, span, clipRing);
  if (!site) return null;
  const radius = Math.max(6, span * 0.055);
  const depth = Math.max(3, span * 0.025);
  let bedY = site.y;
  if (mesh) {
    const carved = carveWaterBowl(mesh, site.x, site.z, radius * 1.05, depth);
    if (carved != null) bedY = carved;
  }
  if (bedY == null) return null;
  return {
    x: site.x,
    z: site.z,
    y: bedY + Math.max(0.8, depth * 0.35),
    radius: radius * 0.92,
  };
}

export function addWaterPond(parent, mesh, sample, span) {
  const feature = prepareWaterFeature(mesh, sample, span);
  if (!feature) return null;
  return addWaterDisc(parent, feature.x, feature.z, feature.y, feature.radius);
}
