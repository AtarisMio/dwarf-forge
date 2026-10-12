import test from 'node:test';
import assert from 'node:assert/strict';
import {ForgeGame} from '../src/simulation.js';
import {SaveSlots} from '../src/save-slots.js';

const store = () => {
  const map = new Map();
  return {getItem:key => map.get(key) ?? null, setItem:(key,value) => map.set(key,value)};
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
  const value = game.current.value;
  assert.equal(game.takeAnvil().ok, true); checkpoint();
  assert.equal(game.offer(id).ok, true); checkpoint();
  assert.equal(game.state.offered, value);
  assert.equal(game.pickupSword(id).ok, true); checkpoint();
  assert.equal(game.state.offered, 0);
  assert.equal(game.state.carriedId, id);
  assert.equal(game.state.swords.find(s => s.id===id).value, value);
});

test('a purchased merchant item stays sold after closing and reopening the browser', () => {
  const storage = store(); const saves = new SaveSlots(storage, ForgeGame.restore);
  const game = new ForgeGame();
  game.settle(); game.settle();
  assert.equal(game.merchantAvailable, true, 'merchant arrives on day three');
  game.state.gold = 100000;
  const offer = game.merchantStock.find(s => s.remaining>0);
  const before = offer.remaining;
  const price = offer.price;
  assert.equal(game.buyMerchant(offer.id).ok, true);
  saves.save(0, game.state);
  const resumed = new SaveSlots(storage, ForgeGame.restore).load(0);
  assert.ok(resumed);
  assert.equal(resumed.merchantStock.find(s => s.id===offer.id).remaining, before-1);
  assert.equal(resumed.state.gold, 100000-price);
});
