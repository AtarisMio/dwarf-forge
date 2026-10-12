const KEY = 'forge-tax-web-slots-v2';
const LEGACY_KEY = 'forge-tax-web-v1';
const copy = value => JSON.parse(JSON.stringify(value));
const strings = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
const union = (...values) => [...new Set(values.flatMap(strings))];

export class SaveSlots {
  constructor(storage, restore) {
    this.storage = storage;
    this.restore = restore;
    this.unavailable = false;
    this.data = {version:2, active:0, slots:[null,null,null], discoveries:[], unlocks:[]};
    let validEnvelope = false;
    try {
      const raw = this.storage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.version === 2 && Array.isArray(parsed.slots) && parsed.slots.length === 3) {
        validEnvelope = true;
        this.data.slots = parsed.slots;
        this.data.active = Number.isInteger(parsed.active) && parsed.active >= 0 && parsed.active < 3 ? parsed.active : 0;
        this.data.discoveries = strings(parsed.discoveries);
        this.data.unlocks = strings(parsed.unlocks);
      }
    } catch { /* A bad envelope may still have a valid untouched legacy save. */ }
    if (!validEnvelope) {
      try {
        const legacy = this.restore(this.storage.getItem(LEGACY_KEY));
        if (legacy) this.save(0, legacy.state);
      } catch { this.unavailable = true; }
    }
    try { this.storage.getItem(KEY); } catch { this.unavailable = true; }
  }
  get activeSlot() { return this.data.active; }
  get shared() { return {discoveries:[...this.data.discoveries], unlocks:[...this.data.unlocks]}; }
  withCollections(state) {
    return {...state, discoveries:union(state.discoveries, this.data.discoveries), unlocks:union(state.unlocks, this.data.unlocks)};
  }
  checkSlot(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new RangeError('Invalid save slot');
  }
  persist() {
    try { this.storage.setItem(KEY, JSON.stringify(this.data)); } catch { this.unavailable = true; }
  }
  select(slot) { this.checkSlot(slot); this.data.active = slot; this.persist(); }
  load(slot = this.activeSlot) {
    this.checkSlot(slot);
    const raw = this.data.slots[slot];
    if (!raw) return null;
    const game = this.restore(JSON.stringify(raw));
    if (!game) return null;
    game.state = this.withCollections(game.state);
    return game;
  }
  save(slot, state) {
    this.checkSlot(slot);
    const candidate = this.withCollections(copy(state));
    if (!this.restore(JSON.stringify(candidate))) throw new Error('Refusing invalid save state');
    this.data.slots[slot] = candidate;
    this.data.discoveries = union(candidate.discoveries, this.data.discoveries);
    this.data.unlocks = union(candidate.unlocks, this.data.unlocks);
    this.persist();
  }
  summaries() {
    return this.data.slots.map((raw, slot) => {
      const game = raw ? this.restore(JSON.stringify(raw)) : null;
      return game ? {slot, empty:false, day:game.state.day, status:game.state.status, gold:game.state.gold ?? 0, swordCount:game.state.swords?.length ?? 0} : {slot, empty:true};
    });
  }
}
