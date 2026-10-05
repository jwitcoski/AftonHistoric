import { ERAS } from '../timeline/EraManager.js';

export class EraSwitcher {
  constructor(container, eraManager) {
    this.container = container;
    this.eraManager = eraManager;
    this.buttons = new Map();
    Object.entries(ERAS).forEach(([year, era]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'era-button';
      button.textContent = era.label;
      button.setAttribute('aria-label', `${era.name}, ${year}`);
      button.dataset.era = year;
      button.addEventListener('click', () => eraManager.setEra(year));
      container.appendChild(button);
      this.buttons.set(Number(year), button);
    });
    this.eraManager.addEventListener('change', (event) => this.update(event.detail.era));
    this.update(this.eraManager.getEra());
  }

  update(era) {
    this.buttons.forEach((button, year) => {
      const active = year === Number(era);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
}
