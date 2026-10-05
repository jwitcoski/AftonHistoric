/** Animation loop, visibility pausing, and scene lifecycle for clay scenes. */

export function createSceneRuntime({ renderer, scene, controller, embed, getAnimations, getLastTime, setLastTime }) {
  let running = true;
  let rafId = 0;
  let observer = null;
  let scheduled = false;

  function tick(now) {
    scheduled = false;
    if (!running) return;
    scheduled = true;
    rafId = requestAnimationFrame(tick);
    const previous = getLastTime();
    const dt = Math.min(0.05, (now - previous) / 1000);
    setLastTime(now);
    const animations = getAnimations();
    controller.advance(dt, now);
    const motionDt = animations.reduceMotion ? 0 : dt;
    if (animations.trailRiders) animations.updateTrailRiders(animations.trailRiders, motionDt);
    if (animations.parkRiders) animations.updateParkRiders(animations.parkRiders, motionDt);
    if (animations.liftChairs) animations.updateLiftChairs(animations.liftChairs, motionDt);
    if (animations.liftGondolas) animations.updateLiftChairs(animations.liftGondolas, motionDt);
    if (animations.liftTbars) animations.updateTBarLifts(animations.liftTbars, motionDt);
    if (animations.liftCarpets) animations.updateCarpetLifts(animations.liftCarpets, motionDt);
    if (animations.updateCars) animations.updateCars(motionDt);
    controller.frame(now * 0.001);
    renderer.render(scene, animations.camera);
  }

  function start() {
    if (running && !scheduled) {
      scheduled = true;
      rafId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    running = false;
    scheduled = false;
    if (rafId) cancelAnimationFrame(rafId);
    observer?.disconnect();
  }

  observer = new IntersectionObserver(
    (entries) => {
      running = entries.some((entry) => entry.isIntersecting);
      if (running) {
        setLastTime(performance.now());
        start();
      }
    },
    { threshold: 0.05 },
  );
  observer.observe(embed);

  return {
    start,
    stop,
    dispose() {
      stop();
      observer?.disconnect();
    },
  };
}
