/**
 * Configuration constants, palette colors, and URL helpers for clay 3D maps.
 */

export const HERO_SPAN = 100;
export const MAX_TREES = 420;
export const MAX_RIDERS = 280;
export const MAX_TRAILS = 220;
/** Desired trail width in hero/display units (after mesh fit). Keep very thin. */
export const TRAIL_WIDTH = 0.34;
export const TRAIL_STYLES = {
  green: { color: 0x86efac, emissive: 0x22c55e, intensity: 0.1, key: "green" },
  blue: { color: 0x93c5fd, emissive: 0x3b82f6, intensity: 0.11, key: "blue" },
  black: { color: 0x64748b, emissive: 0x334155, intensity: 0.08, key: "black" },
};
export const TREE_SCALE = 1.16;
export const MAX_BUILDINGS = 48;
/** Buildings are authored in mesh meters; keep them tiny in the hero (~1/16 prior size). */
export const BUILDING_SHRINK = 0.06;
export const GRID_RES = 72;
export const HEIGHT_EXAGGERATE = 2;

/** Clay island palette — white snow, green trees, blue water; US trail colors. */
export const PALETTE = {
  bg: 0xffffff,
  snow: 0xffffff,
  snowShade: 0xe8eef2,
  rock: 0xb0bac4,
  rockDeep: 0x8a96a3,
  rockLip: 0xc5ced6,
  tree: 0x2f9e44,
  treeDeep: 0x237a36,
  trunk: 0x6b4f3a,
  trailGreen: 0x22c55e,
  trailGreenEm: 0x16a34a,
  trailBlue: 0x3b82f6,
  trailBlueEm: 0x2563eb,
  trailBlack: 0x171717,
  trailBlackEm: 0x404040,
  water: 0x2f9fff,
  waterEm: 0x1d7fd6,
  building: 0xd7b08a,
  buildingRoof: 0x3f3c3a,
  buildingStucco: 0xf3f1ec,
  buildingTrim: 0x4a3428,
  wood: 0x6b2d1a,
  woodMid: 0x4a1f12,
  woodDeep: 0x2f140c,
  woodHighlight: 0x8a3d24,
  lift: 0x6b7785,
  cable: 0x4b5563,
};

export function sceneRoot(resortId) {
  return new URL(`/clay_scenes/${resortId}/`, location.origin);
}

export function regionSceneRoot(regionId) {
  return new URL(`/clay_scenes/regions/${encodeURIComponent(resortIdSafe(regionId))}/`, location.origin);
}

function resortIdSafe(id) {
  return String(id || "").replace(/^\/+|\/+$/g, "");
}

export function catalogUrl() {
  return new URL("/clay_scenes/catalog.json", location.origin);
}

export function regionCatalogUrl() {
  return new URL("/clay_scenes/regions/catalog.json", location.origin);
}

export function regionByPageUrl(pageId) {
  return new URL(`/clay_scenes/regions/by-page/${encodeURIComponent(pageId)}.json`, location.origin);
}

export function gameSceneBase(resort) {
  if (!resort?.id || !resort?.playable_ver) return null;
  const host = location.hostname;
  const path = `game_scenes/${resort.id}/${resort.playable_ver}/`;
  if (host === "localhost" || host === "127.0.0.1") {
    return new URL(`/${path}`, location.origin);
  }
  if (host === "globalskiatlas.com" || host === "www.globalskiatlas.com") {
    return new URL(`https://globalskiatlas.com/${path}`);
  }
  return new URL(
    `https://globalskiatlas-backend-k8s-output.s3.us-east-1.amazonaws.com/${path}`,
  );
}

export function playableHref(resort) {
  if (!resort?.id || !resort?.playable_ver) return null;
  return `/playable/?resort=${encodeURIComponent(resort.id)}&ver=${encodeURIComponent(resort.playable_ver)}`;
}

export function capDpr() {
  return Math.min(window.devicePixelRatio || 1, 1.35);
}
