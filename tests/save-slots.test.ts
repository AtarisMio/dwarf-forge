import test from 'node:test';
import assert from 'node:assert/strict';

import {SaveSlots} from '../src/save-slots.ts';
import {isRecord} from '../src/game-types.ts';
interface FixtureState{valid:boolean;day:number;status:string;discoveries:string[];unlocks:string[];gold?:number}
function required<T>(value:T|null|undefined):T{assert.ok(value!==null&&value!==undefined);return value;}
const makeStorage = () => {
  const map = new Map<string,string>();
  return {getItem: (key:string) => map.get(key) ?? null, setItem: (key:string,value:string) => map.set(key, value)};
};
const restore = (raw:unknown):{state:FixtureState}|null => {
  try { if(typeof raw!=='string')return null;const value:unknown=JSON.parse(raw);
   if(!isRecord(value)||value.valid!==true||typeof value.day!=='number'||typeof value.status!=='string')return null;
   const strings=(v:unknown):string[]=>Array.isArray(v)?v.filter((key:unknown):key is string=>typeof key==='string'):[];
   return {state:{valid:true,day:value.day,status:value.status,discoveries:strings(value.discoveries),unlocks:strings(value.unlocks),...(typeof value.gold==='number'?{gold:value.gold}:{})}};
  } catch {return null;}
};
const state = (day:number, discoveries:string[] = [], unlocks:string[] = []):FixtureState => ({valid:true, day, status:'running', discoveries, unlocks});

test('three independent slots preserve progress when changing the active slot', () => {
  assert.equal(typeof SaveSlots, 'function', 'three-slot save boundary must exist');
  const saves = new SaveSlots(makeStorage(), restore);
  assert.equal(saves.unavailable, false);
  saves.save(0, state(3)); saves.save(1, state(9)); saves.select(1);
  assert.equal(required(saves.load(0)).state.day, 3);
  assert.equal(required(saves.load(1)).state.day, 9);
  assert.equal(saves.load(2), null);
  assert.equal(saves.activeSlot, 1);
});

test('codex discoveries and achievement unlocks are shared without sharing run currency', () => {
  const saves = new SaveSlots(makeStorage(), restore);
  saves.save(0, {...state(3, ['sword:holy'], ['wick']), gold:400});
  saves.save(1, {...state(1, ['relic:die'], ['royal']), gold:0});
  const loaded = required(saves.load(0)).state;
  assert.deepEqual(loaded.discoveries.sort(), ['relic:die', 'sword:holy']);
  assert.deepEqual(loaded.unlocks.sort(), ['royal', 'wick']);
  assert.equal(loaded.gold, 400);
});

test('invalid new state never overwrites an existing valid save', () => {
  const storage = makeStorage(); const saves = new SaveSlots(storage, restore);
  saves.save(0, state(3));
  assert.throws(() => saves.save(0, {valid:false, day:99}));
  assert.equal(required(new SaveSlots(storage, restore).load(0)).state.day, 3);
});

test('legacy progress migrates once into slot one without removing its backup', () => {
  const storage = makeStorage(); storage.setItem('forge-tax-web-v1', JSON.stringify(state(8)));
  const saves = new SaveSlots(storage, restore);
  assert.equal(required(saves.load(0)).state.day, 8);
  saves.save(0, state(9));
  assert.equal(required(new SaveSlots(storage, restore).load(0)).state.day, 9);
  assert.equal(JSON.parse(required(storage.getItem('forge-tax-web-v1'))).day, 8);
});

test('unavailable browser storage leaves an in-memory playable run', () => {
  const broken = {getItem(){throw new Error('denied');}, setItem(){throw new Error('denied');}};
  const saves = new SaveSlots(broken, restore);
  assert.equal(saves.unavailable, true);
  saves.save(2, state(4));
  assert.equal(required(saves.load(2)).state.day, 4);
});

test('malformed slot metadata does not delete the legacy fallback', () => {
  const storage = makeStorage();
  storage.setItem('forge-tax-web-slots-v2', '{bad json');
  storage.setItem('forge-tax-web-v1', JSON.stringify(state(6)));
  assert.equal(required(new SaveSlots(storage, restore).load(0)).state.day, 6);
});
