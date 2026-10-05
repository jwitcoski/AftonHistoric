/**
 * Height grid sampling and terrain snow shading utilities for 3D clay scenes.
 */

import * as THREE from "three";
import { GRID_RES, HEIGHT_EXAGGERATE } from "./config.js";

export function mountainHeight(x, z) {
  const peak = Math.exp(-((x - 5) ** 2 + (z + 11) ** 2) / 110) * 48;
  const ridge = Math.exp(-((x + 16) ** 2) / 80 - (z + 1) ** 2 / 150) * 26;
  const bowl = Math.exp(-((x - 22) ** 2 + (z + 6) ** 2) / 260) * -5;
  const ripple = Math.sin(x * 0.1) * 1.6 + Math.cos(z * 0.08) * 1.3;
  return 5 + (peak + ridge + bowl + ripple) * HEIGHT_EXAGGERATE;
}

export function shadeSnowGeometry(geo, opts = {}) {
  if (!geo?.attributes?.position) return;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const spanY = Math.max(1, maxY - minY);
  const colors = new Float32Array(pos.count * 3);
  const contrast = !!opts.contrast;
  const high = new THREE.Color(contrast ? 0xffffff : 0xffffff);
  const mid = new THREE.Color(contrast ? 0xe8eef4 : 0xf6f8fb);
  const low = new THREE.Color(contrast ? 0xb7c4d4 : 0xe8eef5);
  const slopeShade = new THREE.Color(contrast ? 0x8fa0b3 : 0xdde5ee);
  const slopeAmt = contrast ? 0.78 : 0.46;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const elev = (pos.getY(i) - minY) / spanY;
    if (elev > 0.5) c.copy(mid).lerp(high, (elev - 0.5) / 0.5);
    else c.copy(low).lerp(mid, elev / 0.5);
    const ny = Math.abs(nrm.getY(i));
    const slope = THREE.MathUtils.clamp(1 - ny, 0, 1);
    c.lerp(slopeShade, slope * slopeAmt);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

export function shadeSnowMesh(mesh, opts = null) {
  shadeSnowGeometry(mesh.geometry, opts || {});
  if (mesh.material && !Array.isArray(mesh.material)) mesh.material.dispose();
  mesh.material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.08,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
}

/** O(verts) once, then O(1) bilinear height — avoids Raycaster storms. */
export function makeHeightGrid(mesh, resolution = GRID_RES) {
  const pos = mesh.geometry.attributes.position;
  const ox = mesh.position.x;
  const oy = mesh.position.y;
  const oz = mesh.position.z;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const z = pos.getZ(i) + oz;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const w = Math.max(1e-3, maxX - minX);
  const d = Math.max(1e-3, maxZ - minZ);
  const heights = new Float32Array(resolution * resolution);
  heights.fill(-Infinity);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const y = pos.getY(i) + oy;
    const z = pos.getZ(i) + oz;
    const u = Math.min(resolution - 1, Math.max(0, Math.floor(((x - minX) / w) * (resolution - 1))));
    const v = Math.min(resolution - 1, Math.max(0, Math.floor(((z - minZ) / d) * (resolution - 1))));
    const idx = v * resolution + u;
    if (y > heights[idx]) heights[idx] = y;
  }
  /* Fill empty cells from nearest filled neighbor (cheap 1-pass blur). */
  for (let pass = 0; pass < 2; pass++) {
    for (let v = 0; v < resolution; v++) {
      for (let u = 0; u < resolution; u++) {
        const idx = v * resolution + u;
        if (heights[idx] !== -Infinity) continue;
        let best = -Infinity;
        for (let dv = -1; dv <= 1; dv++) {
          for (let du = -1; du <= 1; du++) {
            const uu = u + du;
            const vv = v + dv;
            if (uu < 0 || vv < 0 || uu >= resolution || vv >= resolution) continue;
            const h = heights[vv * resolution + uu];
            if (h > best) best = h;
          }
        }
        if (best !== -Infinity) heights[idx] = best;
      }
    }
  }

  return (x, z) => {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
    const uf = ((x - minX) / w) * (resolution - 1);
    const vf = ((z - minZ) / d) * (resolution - 1);
    const u0 = Math.floor(uf);
    const v0 = Math.floor(vf);
    const u1 = Math.min(resolution - 1, u0 + 1);
    const v1 = Math.min(resolution - 1, v0 + 1);
    const tu = uf - u0;
    const tv = vf - v0;
    const h00 = heights[v0 * resolution + u0];
    const h10 = heights[v0 * resolution + u1];
    const h01 = heights[v1 * resolution + u0];
    const h11 = heights[v1 * resolution + u1];
    if (h00 === -Infinity) return null;
    const a = h00 + (h10 - h00) * tu;
    const b = h01 + (h11 - h01) * tu;
    const interp = a + (b - a) * tv;
    const hi = Math.max(h00, h10, h01, h11);
    return interp + (hi - interp) * 0.45;
  };
}
