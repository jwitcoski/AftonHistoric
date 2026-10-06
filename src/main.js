import './clay/afton-historic.css';
import './landing/county-landing.css';

const TOUR_HASH = '#tour/old-village';
const params = new URLSearchParams(location.search);
const direct = params.has('debug') || params.has('debug-sites');
let sceneMounted = false;

async function enterTour() {
  document.querySelector('#county-landing').hidden = true;
  document.querySelector('#afton-map').hidden = false;
  if (sceneMounted) return;
  sceneMounted = true;
  const { mountAftonHistoricMap } = await import('./clay/afton-historic.js');
  mountAftonHistoricMap();
}

async function showLanding() {
  document.querySelector('#enter-old-village').addEventListener('click', () => { location.hash = TOUR_HASH; });
  const { mountCountyLanding } = await import('./landing/county-landing.js');
  mountCountyLanding({ enterTour: () => { location.hash = TOUR_HASH; } });
}

document.querySelector('#afton-layers-close').addEventListener('click', () => {
  document.querySelector('#afton-layers').hidden = true;
});

// The scene mounts once; leaving the tour reloads to the landing page.
window.addEventListener('hashchange', () => {
  if (location.hash === TOUR_HASH) enterTour();
  else if (sceneMounted && !direct) location.reload();
});

if (direct || location.hash === TOUR_HASH) enterTour();
else showLanding();