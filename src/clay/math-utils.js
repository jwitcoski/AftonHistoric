/**
 * Math, noise, 2D polygon, convex hull, and curve geometry utilities for 3D clay scenes.
 */

import * as THREE from "three";

export function rng(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

export function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a * (1 - ux) + b * ux) * (1 - uz) + (c * (1 - ux) + d * ux) * uz;
}

export function fbm(x, z) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 3; o++) {
    v += valueNoise(x * freq, z * freq) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v;
}

export function localXZ(east, north, center) {
  return { x: east - center.x, z: -north - center.z };
}

export function lineParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates || [];
  return [];
}

export function ringParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates?.[0]].filter(Boolean);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).map((poly) => poly?.[0]).filter(Boolean);
  }
  return [];
}

export function polygonParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates].filter(Boolean);
  if (geometry.type === "MultiPolygon") return geometry.coordinates || [];
  return [];
}

export function featureTag(feature, key) {
  const props = feature?.properties || {};
  const tags = props.tags && typeof props.tags === "object" ? props.tags : {};
  let v = tags[key] || props[key] || "";
  if (!v) {
    const other = String(tags.other_tags || props.other_tags || "");
    const m = new RegExp(`${key}"\\s*=>\\s*"([^"]+)`).exec(other);
    if (m) v = m[1];
  }
  return String(v || "").toLowerCase().trim();
}

export function featureOsmWayId(feature) {
  const props = feature?.properties || {};
  const tags = props.tags && typeof props.tags === "object" ? props.tags : {};
  const candidates = [
    tags.osm_way_id,
    props.osm_way_id,
    props.osm_id,
    tags.osm_id,
    props.id,
    props["@id"],
    tags.id,
  ];
  for (const value of candidates) {
    if (value == null || String(value).trim() === "") continue;
    const text = String(value).trim();
    const match = /(?:way:|node:|relation:|nan:|:)?(\d+)\s*$/i.exec(text);
    if (match) return match[1];
  }
  return "";
}

export function isWoodFeature(feature) {
  const natural = featureTag(feature, "natural");
  const landuse = featureTag(feature, "landuse");
  return natural === "wood" || natural === "forest" || landuse === "forest";
}

export function mergeFeatureCollections(...fcs) {
  const features = [];
  for (const fc of fcs) {
    if (fc?.features?.length) features.push(...fc.features);
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}

export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function inPolygon(x, y, outer, holes) {
  if (!outer || outer.length < 3 || !pointInRing(x, y, outer)) return false;
  for (const h of holes || []) {
    if (h.length >= 3 && pointInRing(x, y, h)) return false;
  }
  return true;
}

export function distToRingEdges(x, y, ring) {
  let best = Infinity;
  for (let i = 0; i < (ring || []).length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (!a || !b || a.length < 2 || b.length < 2) continue;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby || 1;
    let t = ((x - a[0]) * abx + (y - a[1]) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a[0] + abx * t), y - (a[1] + aby * t)));
  }
  return best;
}

/** Strictly inside a polygon, inset from the boundary so crowns don't spill out. */
export function firmlyInside(x, y, outer, holes, margin) {
  if (!inPolygon(x, y, outer, holes)) return false;
  if (!(margin > 0)) return true;
  if (distToRingEdges(x, y, outer) < margin) return false;
  for (const h of holes || []) {
    if (h.length >= 3 && distToRingEdges(x, y, h) < margin) return false;
  }
  return true;
}

export function shoelaceArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) * 0.5;
}

export function cross2(ax, az, bx, bz, cx, cz) {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

export function convexHullXZ(points) {
  const pts = (points || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (pts.length < 3) return [];
  const sorted = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2].x, lower[lower.length - 2].z, lower[lower.length - 1].x, lower[lower.length - 1].z, p.x, p.z) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2].x, upper[upper.length - 2].z, upper[upper.length - 1].x, upper[upper.length - 1].z, p.x, p.z) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function expandHull(poly, amount) {
  if (!poly?.length || !(amount > 0)) return poly || [];
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  cx /= poly.length;
  cz /= poly.length;
  return poly.map((p) => {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    return { x: cx + (dx / d) * (d + amount), z: cz + (dz / d) * (d + amount) };
  });
}

export function insideConvex(x, z, poly) {
  if (!poly?.length) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    if (cross2(a.x, a.z, b.x, b.z, x, z) < 0) return false;
  }
  return true;
}

export function distToHullEdge(x, z, poly) {
  if (!poly?.length) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t)));
  }
  return best;
}

export function distOutsideHull(x, z, poly) {
  if (!poly?.length) return 0;
  if (insideConvex(x, z, poly)) return 0;
  return distToHullEdge(x, z, poly);
}

/** Point-in-polygon for possibly concave island rings ({x,z}…​). */
export function insideIslandRing(x, z, ring) {
  if (!ring?.length) return false;
  const flat = [];
  for (const p of ring) flat.push([p.x, p.z]);
  return pointInRing(x, z, flat);
}

export function distOutsideIsland(x, z, ring) {
  if (!ring?.length) return 0;
  if (insideIslandRing(x, z, ring)) return 0;
  return distToHullEdge(x, z, ring);
}

export function ensureCcwXZ(poly) {
  if (!poly?.length) return poly || [];
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].z - poly[i].x * poly[j].z;
  }
  return a >= 0 ? poly : poly.slice().reverse();
}

export function ensureCcw(poly) {
  if (!poly?.length) return poly || [];
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p.x;
    cz += p.z;
  }
  cx /= poly.length;
  cz /= poly.length;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += (a.x - cx) * (b.z - cz) - (b.x - cx) * (a.z - cz);
  }
  return sum >= 0 ? poly : poly.slice().reverse();
}

export function projectToHull(x, z, hull) {
  let best = Infinity;
  let px = x;
  let pz = z;
  for (let e = 0; e < hull.length; e++) {
    const a = hull[e];
    const b = hull[(e + 1) % hull.length];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best) {
      best = d;
      px = qx;
      pz = qz;
    }
  }
  return { x: px, z: pz };
}

export function ringCentroidXZ(ring) {
  let cx = 0;
  let cz = 0;
  for (const p of ring || []) {
    cx += p.x;
    cz += p.z;
  }
  const n = Math.max(1, ring?.length || 0);
  return { x: cx / n, z: cz / n };
}

/** Even arc-length resample — stops clustered rim verts from making knife-edge wood tris. */
export function resampleRingArc(ring, count) {
  if (!ring?.length) return [];
  const n = ring.length;
  const seg = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    seg.push(len);
    total += len;
  }
  if (!(total > 1e-6)) return ring.slice();
  const out = [];
  const step = total / count;
  let edge = 0;
  let consumed = 0;
  for (let i = 0; i < count; i++) {
    const target = i * step;
    while (edge < n - 1 && consumed + seg[edge] < target) {
      consumed += seg[edge];
      edge += 1;
    }
    const len = seg[edge] || 1e-6;
    const t = Math.max(0, Math.min(1, (target - consumed) / len));
    const a = ring[edge];
    const b = ring[(edge + 1) % n];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return out;
}

export function decimateRing(ring, maxPts) {
  if (!ring?.length || ring.length <= maxPts) return ring || [];
  return resampleRingArc(ring, maxPts);
}

/** Chaikin corner-cut — softens jagged buffer outlines for the cliff rim. */
export function chaikinRing(ring, iterations = 2) {
  let pts = (ring || []).map((p) => ({ x: p.x, z: p.z }));
  if (pts.length < 3) return pts;
  for (let k = 0; k < iterations; k++) {
    const next = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      next.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
    }
    pts = next;
  }
  return ensureCcwXZ(pts);
}

export function prepareIslandRim(hull) {
  if (!hull?.length) return [];
  /* One light Chaikin pass — two passes rounded away major ski-area bays. */
  return chaikinRing(resampleRingArc(decimateRing(hull, 160), 96), 1);
}

export function clipPointRuns(pts, ring) {
  if (!ring?.length) return pts?.length >= 2 ? [pts] : [];
  const runs = [];
  let cur = [];
  for (const p of pts || []) {
    if (p && insideIslandRing(p.x, p.z, ring)) cur.push(p);
    else {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

export function resampleHull(hull, count) {
  return resampleRingArc(hull, count);
}

export function downsampleLine(coords, maxPts = 18) {
  if (!coords || coords.length <= maxPts) return coords || [];
  const out = [];
  const step = (coords.length - 1) / (maxPts - 1);
  for (let i = 0; i < maxPts; i++) {
    out.push(coords[Math.round(i * step)]);
  }
  return out;
}

/** Light Chaikin pass on trail polylines to round OSM kinks before meshing. */
export function smoothTrailPts(pts, iterations = 1) {
  if (!pts || pts.length < 3) return pts || [];
  let cur = pts.map((p) => p.clone());
  for (let pass = 0; pass < iterations; pass++) {
    const next = [cur[0].clone()];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push(
        new THREE.Vector3(
          a.x * 0.75 + b.x * 0.25,
          a.y * 0.75 + b.y * 0.25,
          a.z * 0.75 + b.z * 0.25,
        ),
      );
      next.push(
        new THREE.Vector3(
          a.x * 0.25 + b.x * 0.75,
          a.y * 0.25 + b.y * 0.75,
          a.z * 0.25 + b.z * 0.75,
        ),
      );
    }
    next.push(cur[cur.length - 1].clone());
    cur = next;
  }
  return cur;
}

export function polylineLen(pts) {
  let len = 0;
  for (let i = 1; i < (pts || []).length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return len;
}

export function alongPolyline(pts, dist) {
  if (!pts?.length) return null;
  if (dist <= 0) {
    const a = pts[0];
    const b = pts[Math.min(1, pts.length - 1)];
    const seg = Math.max(1e-6, a.distanceTo(b));
    return {
      x: a.x,
      y: a.y,
      z: a.z,
      tx: (b.x - a.x) / seg,
      tz: (b.z - a.z) / seg,
    };
  }
  let left = dist;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = a.distanceTo(b);
    if (seg < 1e-6) continue;
    if (left <= seg) {
      const t = left / seg;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        tx: (b.x - a.x) / seg,
        tz: (b.z - a.z) / seg,
      };
    }
    left -= seg;
  }
  const a = pts[pts.length - 2] || pts[0];
  const b = pts[pts.length - 1];
  const seg = Math.max(1e-6, a.distanceTo(b));
  return {
    x: b.x,
    y: b.y,
    z: b.z,
    tx: (b.x - a.x) / seg,
    tz: (b.z - a.z) / seg,
  };
}

export function sampleAlongPolyline(pts, step) {
  if (!pts || pts.length < 2) return [];
  const out = [];
  let dist = 0;
  let next = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = a.distanceTo(b);
    if (seg < 1e-4) continue;
    while (next <= dist + seg) {
      const t = (next - dist) / seg;
      out.push(new THREE.Vector3().lerpVectors(a, b, t));
      next += step;
    }
    dist += seg;
  }
  if (!out.length) out.push(pts[0].clone());
  const last = pts[pts.length - 1];
  if (out[out.length - 1].distanceTo(last) > step * 0.25) out.push(last.clone());
  return out;
}

export function horizTangentAt(pts, i) {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
  else t.normalize();
  return t;
}

export function sideVector(tan) {
  const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), tan);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  else side.normalize();
  return side;
}

export function buildSaggedSpan(a, b, samples, sag) {
  const pts = [];
  for (let k = 1; k < samples; k++) {
    const t = k / samples;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return pts;
}

