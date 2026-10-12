import test from 'node:test';
import assert from 'node:assert/strict';

const {SaveSlots} = await import('../src/save-slots.js').catch(() => ({}));
const makeStorage = () => {
  const map = new Map();
  return {getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value)};
};
const restore = raw => {
  try { const state = JSON.parse(raw); return state.valid ? {state} : null; } catch { return null; }
};
const state = (day, discoveries = [], unlocks = []) => ({valid:true, day, status:'running', discoveries, unlocks});

test('three independent slots preserve progress when changing the active slot', () => {
  assert.equal(typeof SaveSlots, 'function', 'three-slot save boundary must exist');
  const saves = new SaveSlots(makeStorage(), restore);
  assert.equal(saves.unavailable, false);
  saves.save(0, state(3)); saves.save(1, state(9)); saves.select(1);
  assert.equal(saves.load(0).state.day, 3);
  assert.equal(saves.load(1).state.day, 9);
  assert.equal(saves.load(2), null);
  assert.equal(saves.activeSlot, 1);
});

test('codex discoveries and achievement unlocks are shared without sharing run currency', () => {
  const saves = new SaveSlots(makeStorage(), restore);
  saves.save(0, {...state(3, ['sword:holy'], ['wick']), gold:400});
  saves.save(1, {...state(1, ['relic:die'], ['royal']), gold:0});
  const loaded = saves.load(0).state;
  assert.deepEqual(loaded.discoveries.sort(), ['relic:die', 'sword:holy']);
  assert.deepEqual(loaded.unlocks.sort(), ['royal', 'wick']);
  assert.equal(loaded.gold, 400);
});

test('invalid new state never overwrites an existing valid save', () => {
  const storage = makeStorage(); const saves = new SaveSlots(storage, restore);
  saves.save(0, state(3));
  assert.throws(() => saves.save(0, {valid:false, day:99}));
  assert.equal(new SaveSlots(storage, restore).load(0).state.day, 3);
});

test('legacy progress migrates once into slot one without removing its backup', () => {
  const storage = makeStorage(); storage.setItem('forge-tax-web-v1', JSON.stringify(state(8)));
  const saves = new SaveSlots(storage, restore);
  assert.equal(saves.load(0).state.day, 8);
  saves.save(0, state(9));
  assert.equal(new SaveSlots(storage, restore).load(0).state.day, 9);
  assert.equal(JSON.parse(storage.getItem('forge-tax-web-v1')).day, 8);
});

test('unavailable browser storage leaves an in-memory playable run', () => {
  const broken = {getItem(){throw new Error('denied');}, setItem(){throw new Error('denied');}};
  const saves = new SaveSlots(broken, restore);
  assert.equal(saves.unavailable, true);
  saves.save(2, state(4));
  assert.equal(saves.load(2).state.day, 4);
});

test('malformed slot metadata does not delete the legacy fallback', () => {
  const storage = makeStorage();
  storage.setItem('forge-tax-web-slots-v2', '{bad json');
  storage.setItem('forge-tax-web-v1', JSON.stringify(state(6)));
  assert.equal(new SaveSlots(storage, restore).load(0).state.day, 6);
});
