import type {GameState,SwordState,RelicId,SwordTypeId,TicketDisplay,Outcome,TicketRow,StrikeSuccess} from '../src/game-types.ts';
import {isRecord,OUTCOMES} from '../src/game-types.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ForgeGame} from '../src/simulation.ts';

function current(game:ForgeGame):SwordState{const sword=game.current;assert.ok(sword,'expected a selected sword in this test phase');return sword;}
function required<T>(value:T|null|undefined):T{assert.ok(value!==null&&value!==undefined,'expected fixture to exist');return value;}
import {SaveSlots} from '../src/save-slots.ts';

const store = () => {
  const map = new Map<string,string>();
  return {getItem:(key:string) => map.get(key) ?? null, setItem:(key:string,value:string) => map.set(key,value)};
};

test('physical sword movement and tribute retrieval survive save/resume after each player action', () => {
  let game = new ForgeGame();
  const saves = new SaveSlots(store(), ForgeGame.restore);
  const id = game.state.swords[0].id;
  assert.equal(typeof game.pickupSword, 'function', 'physical swords need model actions');
  const checkpoint = () => {
    saves.save(0, game.state);
    const restored = saves.load(0);
    assert.ok(restored, 'valid player progress must restore');
    game = restored;
  };
  assert.equal(game.pickupSword(id).ok, true); checkpoint();
  assert.equal(game.state.carriedId, id);
  assert.equal(game.heat().ok, true); checkpoint();
  assert.equal(game.placeSword(id, 'anvil').ok, true); checkpoint();
  assert.equal(game.state.anvilId, id);
  assert.equal(game.strike(() => .999).ok, true); checkpoint();
  const value = current(game).value;
  assert.equal(game.takeAnvil().ok, true); checkpoint();
  assert.equal(game.offer(id).ok, true); checkpoint();
  assert.equal(game.state.offered, value);
  assert.equal(game.pickupSword(id).ok, true); checkpoint();
  assert.equal(game.state.offered, 0);
  assert.equal(game.state.carriedId, id);
  assert.equal(game.state.swords.find(s => s.id===id)!.value, value);
});

test('a purchased merchant item stays sold after closing and reopening the browser', () => {
  const storage = store(); const saves = new SaveSlots(storage, ForgeGame.restore);
  const game = new ForgeGame();
  game.settle(); game.settle();
  assert.equal(game.merchantAvailable, true, 'merchant arrives on day three');
  game.state.gold = 100000;
  const offer = required(game.merchantStock.find(s => s.remaining>0));
  const before = offer.remaining;
  const price = offer.price;
  assert.equal(game.buyMerchant(offer.id).ok, true);
  saves.save(0, game.state);
  const resumed = new SaveSlots(storage, ForgeGame.restore).load(0);
  assert.ok(resumed);
  assert.equal(required(resumed.merchantStock.find(s => s.id===offer.id)).remaining, before-1);
  assert.equal(resumed.state.gold, 100000-price);
});

test('untrusted shared unlocks are revalidated without losing valid discoveries or slot currency',()=>{
 const storage=store(),game=new ForgeGame();game.state.gold=77;game.state.swordCredits=3;
 storage.setItem('forge-tax-web-slots-v2',JSON.stringify({version:2,active:0,slots:[game.state,null,null],discoveries:['sword:holy'],unlocks:['die','not-a-real-relic']}));
 const saves=new SaveSlots(storage,ForgeGame.restore),loaded=saves.load(0);assert.ok(loaded);
 assert.deepEqual(loaded.state.unlocks,['die']);assert.ok(loaded.state.discoveries.includes('sword:holy'));
 assert.equal(loaded.state.gold,77);assert.equal(loaded.swordCoins,3);assert.ok(ForgeGame.restore(JSON.stringify(loaded.state)));
 saves.save(0,loaded.state);const resumed=saves.load(0);assert.ok(resumed);assert.deepEqual(resumed.state.unlocks,['die']);assert.equal(resumed.swordCoins,3);
});

test('raw save boundary rejects non-text input and invalid domain discriminants',()=>{
 const game=new ForgeGame();for(const raw of [undefined,null,3,{},game.state])assert.equal(ForgeGame.restore(raw),null);
 const raw:unknown=JSON.parse(JSON.stringify(game.state));assert.ok(isRecord(raw));assert.ok(Array.isArray(raw.swords));const sword:unknown=raw.swords[0];assert.ok(isRecord(sword));sword.previous='not-an-outcome';assert.equal(ForgeGame.restore(JSON.stringify(raw)),null);
});


test('save validators reject coerced union arrays and malformed optional discriminants',()=>{
 const game=new ForgeGame();game.settle();
 const cases:((state:Record<string,unknown>)=>void)[]=[
  state=>{state.status=['running'];},
  state=>{assert.ok(Array.isArray(state.swords));const sword:unknown=state.swords[0];assert.ok(isRecord(sword));sword.lastBonus={kind:['base'],amount:1};},
  state=>{assert.ok(isRecord(state.merchant));state.merchant.stock=[{id:'item',name:'item',kind:['item'],itemId:'scale',price:1,remaining:1,purchased:0}];},
  state=>{assert.ok(Array.isArray(state.history));const entry:unknown=state.history[0];assert.ok(isRecord(entry));entry.ok=false;},
  state=>{state.migratedFrom=2;},state=>{state.taxCredit=null;},state=>{state.nextTaxCredit=null;}
 ];
 for(const mutate of cases){const raw:unknown=structuredClone(game.state);assert.ok(isRecord(raw));mutate(raw);assert.equal(ForgeGame.restore(JSON.stringify(raw)),null);}
 assert.ok(ForgeGame.restore(JSON.stringify(game.state)));
});
