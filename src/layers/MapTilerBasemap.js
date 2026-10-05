import * as THREE from 'three';
import aftonArea from '../../data/afton-area.json';

const TILE_SIZE = 256;
const MAP_CENTER = aftonArea.center;

function toWorldPixels(lat, lon, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = THREE.MathUtils.clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
  return {
    x: (lon + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * scale,
  };
}

function loadTile(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load MapTiler tile: ${url}`));
    image.src = url;
  });
}

export async function loadMapTilerTexture(apiKey, { width = aftonArea.mapSizeMeters.width, depth = aftonArea.mapSizeMeters.depth, zoom = 15 } = {}) {
  if (!apiKey) return null;

  const center = toWorldPixels(MAP_CENTER.lat, MAP_CENTER.lon, zoom);
  const metersPerPixel = 156543.03392 * Math.cos(MAP_CENTER.lat * Math.PI / 180) / 2 ** zoom;
  const sourceWidth = width / metersPerPixel;
  const sourceHeight = depth / metersPerPixel;
  const firstTileX = Math.floor((center.x - sourceWidth / 2) / TILE_SIZE);
  const lastTileX = Math.floor((center.x + sourceWidth / 2) / TILE_SIZE);
  const firstTileY = Math.floor((center.y - sourceHeight / 2) / TILE_SIZE);
  const lastTileY = Math.floor((center.y + sourceHeight / 2) / TILE_SIZE);
  const tileCount = 2 ** zoom;
  const tileRequests = [];

  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      const url = `https://api.maptiler.com/maps/streets-v2/${zoom}/${wrappedX}/${tileY}.png?key=${encodeURIComponent(apiKey)}`;
      tileRequests.push(loadTile(url).then((image) => ({ x: tileX, y: tileY, image })));
    }
  }
  const tiles = await Promise.all(tileRequests);

  const mosaic = document.createElement('canvas');
  mosaic.width = (lastTileX - firstTileX + 1) * TILE_SIZE;
  mosaic.height = (lastTileY - firstTileY + 1) * TILE_SIZE;
  const context = mosaic.getContext('2d');
  tiles.forEach(({ x, y, image }) => {
    context.drawImage(image, (x - firstTileX) * TILE_SIZE, (y - firstTileY) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  });

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 1024;
  textureCanvas.height = Math.round(1024 * depth / width);
  const textureContext = textureCanvas.getContext('2d');
  const sourceX = center.x - firstTileX * TILE_SIZE - sourceWidth / 2;
  const sourceY = center.y - firstTileY * TILE_SIZE - sourceHeight / 2;
  textureContext.drawImage(mosaic, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, textureCanvas.width, textureCanvas.height);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}