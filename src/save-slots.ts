import {isRecord} from './game-types.ts';
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):unknown}
export interface CollectionState {day:number;status:string;discoveries:string[];unlocks:string[];gold?:number;swords?:readonly object[]}
export interface SlotEnvelope {version:2;active:number;slots:unknown[];discoveries:string[];unlocks:string[]}
export type SlotSummary={slot:number;empty:true}|{slot:number;empty:false;day:number;status:string;gold:number;swordCount:number};
const KEY = 'forge-tax-web-slots-v2';
const LEGACY_KEY = 'forge-tax-web-v1';
const copy = (value:unknown):unknown => JSON.parse(JSON.stringify(value));
const strings = (value:unknown):string[] => Array.isArray(value) ? value.filter((v:unknown):v is string => typeof v === 'string') : [];
const union = (...values:unknown[]) => [...new Set(values.flatMap(strings))];

export class SaveSlots<G extends {state:CollectionState}> {
  readonly storage:StorageLike;
  readonly restore:(raw:unknown)=>G|null;
  unavailable:boolean;
  data:SlotEnvelope;
  constructor(storage:StorageLike, restore:(raw:unknown)=>G|null) {
    this.storage = storage;
    this.restore = restore;
    this.unavailable = false;
    this.data = {version:2, active:0, slots:[null,null,null], discoveries:[], unlocks:[]};
    let validEnvelope = false;
    try {
      const raw = this.storage.getItem(KEY);
      const parsed:unknown = raw ? JSON.parse(raw) : null;
      if (isRecord(parsed) && parsed.version === 2 && Array.isArray(parsed.slots) && parsed.slots.length === 3) {
        validEnvelope = true;
        this.data.slots = parsed.slots;
        this.data.active = typeof parsed.active==='number' && Number.isInteger(parsed.active) && parsed.active >= 0 && parsed.active < 3 ? parsed.active : 0;
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
  withCollections(state:G['state']):G['state'] {
    const discoveries=union(state.discoveries,this.data.discoveries),unlocks=union(state.unlocks,this.data.unlocks);
    // Shared metadata is untrusted. The supplied validator decides which unlock
    // keys belong to the domain, including legacy keys in other save clients.
    const combined=this.restore(JSON.stringify({...state,discoveries,unlocks}));
    if(combined)return combined.state;
    const validUnlocks=unlocks.filter(id=>!!this.restore(JSON.stringify({...state,discoveries,unlocks:union(state.unlocks,[id])})));
    return this.restore(JSON.stringify({...state,discoveries,unlocks:validUnlocks}))?.state??state;
  }
  checkSlot(slot:number) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new RangeError('Invalid save slot');
  }
  persist() {
    try { this.storage.setItem(KEY, JSON.stringify(this.data)); } catch { this.unavailable = true; }
  }
  select(slot:number) { this.checkSlot(slot); this.data.active = slot; this.persist(); }
  load(slot = this.activeSlot) {
    this.checkSlot(slot);
    const raw = this.data.slots[slot];
    if (!raw) return null;
    const game = this.restore(JSON.stringify(raw));
    if (!game) return null;
    game.state = this.withCollections(game.state);
    return game;
  }
  save(slot:number, state:unknown) {
    this.checkSlot(slot);
    const copied=copy(state);if(!isRecord(copied))throw new Error('Refusing invalid save state');
    const validated=this.restore(JSON.stringify({...copied,discoveries:strings(copied.discoveries),unlocks:strings(copied.unlocks)}));
    if(!validated)throw new Error('Refusing invalid save state');
    const candidate=this.withCollections(validated.state);
    this.data.slots[slot] = candidate;
    this.data.discoveries = union(candidate.discoveries, this.data.discoveries);
    this.data.unlocks = union(candidate.unlocks, this.data.unlocks);
    this.persist();
  }
  summaries():SlotSummary[] {
    return this.data.slots.map((raw, slot) => {
      const game = raw ? this.restore(JSON.stringify(raw)) : null;
      return game ? {slot, empty:false, day:game.state.day, status:game.state.status, gold:game.state.gold ?? 0, swordCount:game.state.swords?.length ?? 0} : {slot, empty:true};
    });
  }
}
