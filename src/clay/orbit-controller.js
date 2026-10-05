/** Camera orbit, zoom, pointer input, and responsive framing for clay scenes. */

import * as THREE from "three";

const DRAG_PX = 10;

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createOrbitController({ camera, canvas, container, renderer, getBounds, reduceMotion = false, autoRotateOnly = false }) {
  let az = 0.55;
  let polar = 0.78;
  let zoom = 1;
  let dragging = false;
  let dragReady = false;
  let lastPointer = null;
  let resumeSpinAt = 0;
  let focusCenter = null;
  let focusRadius = null;
  let focusTransition = null;
  const idleResumeMs = 5000;
  const spinSpeed = 0.12;
  const polarMin = 0.18;
  const polarMax = 1.35;
  const zoomMin = 0.45;
  const zoomMax = 2.6;
  const pointers = new Map();
  let pinch = null;

  function markInteracted() {
    if (autoRotateOnly) return;
    resumeSpinAt = performance.now() + idleResumeMs;
  }

  function applyZoomFactor(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, zoomMin, zoomMax);
  }

  function syncFromBounds() {
    const { radius } = getBounds();
    az = 0.55;
    polar = 0.78;
    const aspect = Math.max(0.5, camera.aspect || 1);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
    const fitFov = Math.min(vFov, hFov);
    const needDist = (Math.max(1, radius) * 1.18) / Math.sin(fitFov * 0.5);
    const baseDist = Math.max(1, radius * 1.72);
    zoom = THREE.MathUtils.clamp(needDist / baseDist, zoomMin, zoomMax);
  }

  function reset() {
    focusCenter = null;
    focusRadius = null;
    focusTransition = null;
    syncFromBounds();
    resumeSpinAt = performance.now() + idleResumeMs;
  }

  function focus(point, radius = 4) {
    const current = getBounds();
    const fromCenter = focusCenter?.clone() ?? current.center.clone();
    const fromRadius = focusRadius ?? current.radius;
    const fromZoom = zoom;
    focusCenter = fromCenter.clone();
    focusRadius = fromRadius;
    focusTransition = {
      startedAt: performance.now(),
      duration: 1050,
      fromCenter,
      fromRadius,
      fromZoom,
      toCenter: point.clone(),
      toRadius: radius,
      toZoom: 0.85,
    };
    resumeSpinAt = Infinity;
  }

  function activePointers() {
    return [...pointers.values()];
  }

  function beginPinch() {
    const pts = activePointers();
    if (pts.length < 2) {
      pinch = null;
      return;
    }
    pinch = { dist0: Math.max(8, pointerDistance(pts[0], pts[1])), zoom0: zoom };
    dragging = false;
    dragReady = false;
    lastPointer = null;
  }

  function onPointerDown(e) {
    if (autoRotateOnly) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      beginPinch();
      markInteracted();
      return;
    }
    dragReady = true;
    dragging = false;
    lastPointer = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = "grabbing";
    markInteracted();
  }

  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      const pts = activePointers();
      const dist = pointerDistance(pts[0], pts[1]);
      if (dist >= 8 && pinch.dist0 >= 8) {
        zoom = THREE.MathUtils.clamp(pinch.zoom0 * (pinch.dist0 / dist), zoomMin, zoomMax);
        markInteracted();
      }
      e.preventDefault();
      return;
    }

    if (!dragReady || !lastPointer || pointers.size !== 1) return;
    const dx = e.clientX - lastPointer.x;
    const dy = e.clientY - lastPointer.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    }
    lastPointer = { x: e.clientX, y: e.clientY };
    az -= dx * 0.005;
    polar = THREE.MathUtils.clamp(polar + dy * 0.004, polarMin, polarMax);
    markInteracted();
    e.preventDefault();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const remaining = activePointers()[0];
      lastPointer = remaining ? { x: remaining.x, y: remaining.y } : null;
      dragReady = Boolean(lastPointer);
      dragging = false;
      return;
    }
    dragReady = false;
    dragging = false;
    lastPointer = null;
    canvas.style.cursor = "grab";
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    markInteracted();
  }

  function onWheel(e) {
    if (autoRotateOnly) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    applyZoomFactor(Math.exp(e.deltaY * 0.00115));
    markInteracted();
  }

  function onDoubleClick(e) {
    e.preventDefault();
    if (autoRotateOnly) return;
    reset();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function advance(dt, now) {
    if (focusTransition) {
      const transition = focusTransition;
      const progress = THREE.MathUtils.clamp((now - transition.startedAt) / transition.duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      focusCenter.lerpVectors(transition.fromCenter, transition.toCenter, eased);
      focusRadius = THREE.MathUtils.lerp(transition.fromRadius, transition.toRadius, eased);
      zoom = THREE.MathUtils.lerp(transition.fromZoom, transition.toZoom, eased);
      if (progress === 1) focusTransition = null;
    }
    const autoSpin = !reduceMotion && !dragging && !pinch && now >= resumeSpinAt;
    if (autoSpin) az += dt * spinSpeed;
    return autoSpin;
  }

  function frame(t = 0) {
    const bounds = getBounds();
    const center = focusCenter ?? bounds.center;
    const radius = focusRadius ?? bounds.radius;
    const dist = Math.max(1, radius * 1.72 * zoom);
    const autoSpin = !reduceMotion && !dragging && !pinch && performance.now() >= resumeSpinAt;
    const bob = autoSpin ? Math.sin(t * 0.35) * radius * 0.012 * zoom : 0;
    const horiz = Math.cos(polar) * dist;
    camera.position.set(
      center.x + Math.cos(az) * horiz,
      center.y + Math.sin(polar) * dist + bob,
      center.z + Math.sin(az) * horiz,
    );
    camera.lookAt(center.x, center.y, center.z);
  }

  canvas.style.touchAction = autoRotateOnly ? "pan-y" : "none";
  canvas.style.cursor = autoRotateOnly ? "default" : "grab";
  canvas.setAttribute("aria-label", autoRotateOnly
    ? "Auto-rotating 3D ski resort map"
    : "Drag to orbit the 3D map; pinch or scroll to zoom");
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  syncFromBounds();

  return {
    resize,
    syncFromBounds,
    reset,
    focus,
    advance,
    frame,
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
    },
  };
}
