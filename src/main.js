import './clay/afton-historic.css';
import { mountAftonHistoricMap } from './clay/afton-historic.js';

mountAftonHistoricMap();
document.querySelector('#afton-layers-close').addEventListener('click', () => {
  document.querySelector('#afton-layers').hidden = true;
});