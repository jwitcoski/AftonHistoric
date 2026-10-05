export const ERAS = Object.freeze({
  1855: { label: '1855', name: 'Founding Era', title: 'A river town<br />takes root.', description: 'Along the St. Croix, a new settlement begins to take shape.', caption: 'THE EARLY SETTLEMENT · 1855' },
  1971: { label: '1971', name: 'Incorporation Era', title: 'A community<br />finds its voice.', description: 'Afton incorporates, carrying its rural character into a new era.', caption: 'THE INCORPORATION · 1971' },
  2026: { label: 'Today', name: 'Current Era', title: 'A living town,<br />still unfolding.', description: 'Afton today: a close-knit community shaped by river and memory.', caption: 'AFTON TODAY · 2026' },
});

export class EraManager extends EventTarget {
  constructor(initialEra = 1855) {
    super();
    if (!ERAS[initialEra]) throw new RangeError(`Unsupported era: ${initialEra}`);
    this.currentEra = Number(initialEra);
  }

  setEra(era) {
    const nextEra = Number(era);
    if (!ERAS[nextEra]) throw new RangeError(`Unsupported era: ${era}`);
    if (nextEra === this.currentEra) return ERAS[nextEra];
    const previousEra = this.currentEra;
    this.currentEra = nextEra;
    this.dispatchEvent(new CustomEvent('change', { detail: { era: nextEra, previousEra, info: ERAS[nextEra] } }));
    return ERAS[nextEra];
  }

  getEra() {
    return this.currentEra;
  }
}
