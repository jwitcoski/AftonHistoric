export class LayerManager {
  constructor() {
    this.layers = new Map();
  }

  registerLayer(name, object3D = null) {
    if (!name || this.layers.has(name)) throw new Error(`Layer already registered or invalid: ${name}`);
    const layer = object3D ?? { visible: true };
    layer.visible = true;
    this.layers.set(name, layer);
    return layer;
  }

  showLayer(name) {
    const layer = this.#getLayer(name);
    layer.visible = true;
    return layer;
  }

  hideLayer(name) {
    const layer = this.#getLayer(name);
    layer.visible = false;
    return layer;
  }

  removeLayer(name) {
    const layer = this.layers.get(name);
    if (!layer) return false;
    layer.parent?.remove(layer);
    this.layers.delete(name);
    return true;
  }

  getLayer(name) {
    return this.#getLayer(name);
  }

  #getLayer(name) {
    const layer = this.layers.get(name);
    if (!layer) throw new Error(`Unknown layer: ${name}`);
    return layer;
  }
}
