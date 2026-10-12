import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseLook } from '../src/mouse-look.js';

class Surface {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, extra = {}) {
    const event = { button: 0, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {}, ...extra };
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}
function setup(options = {}) {
  const documentTarget = new Surface(), windowTarget = new Surface(), canvas = new Surface();
  canvas.style = { cursor: '' }; canvas.ownerDocument = documentTarget;
  let capture = null;
  canvas.setPointerCapture = id => { capture = id; };
  canvas.hasPointerCapture = id => capture === id;
  canvas.releasePointerCapture = () => { capture = null; };
  const deltas = [], clicks = [], modes = [], secondary = [];
  let enabled = true, canLook = true;
  const input = createMouseLook(canvas, {
    documentTarget, windowTarget, enabled: () => enabled, canLook: () => canLook,
    onLook: (x, y) => deltas.push([x, y]), onClick: e => clicks.push([e.clientX, e.clientY]),
    onMode: mode => modes.push(mode), onSecondary: () => secondary.push(true), ...options,
  });
  return { input, canvas, documentTarget, windowTarget, deltas, clicks, modes, secondary,
    setEnabled: value => { enabled = value; }, setCanLook: value => { canLook = value; } };
}

test('drag rotates without the Pointer Lock API and never opens a station', () => {
  const s = setup();
  s.canvas.emit('pointerdown');
  assert.deepEqual(s.clicks, []);
  s.documentTarget.emit('pointermove', { clientX: 125, clientY: 112 });
  s.documentTarget.emit('pointermove', { clientX: 145, clientY: 107 });
  s.documentTarget.emit('pointerup', { clientX: 145, clientY: 107 });
  assert.deepEqual(s.deltas, [[25, 12], [20, -5]]);
  assert.deepEqual(s.clicks, []);
  s.documentTarget.emit('pointermove', { clientX: 190 });
  assert.equal(s.deltas.length, 2);
});

test('a short click interacts once, retaining its original raycast position', () => {
  const s = setup();
  s.canvas.emit('pointerdown');
  s.documentTarget.emit('pointermove', { clientX: 102, clientY: 101 });
  assert.equal(s.clicks.length, 0);
  s.documentTarget.emit('pointerup', { clientX: 102, clientY: 101 });
  assert.deepEqual(s.clicks, [[100, 100]]);
  assert.deepEqual(s.deltas, []);
});

test('a rejected lock request leaves drag controls usable', async () => {
  const s = setup();
  s.canvas.requestPointerLock = () => Promise.reject(new Error('not permitted'));
  await s.input.requestLock();
  assert.equal(s.modes.at(-1), 'drag');
  s.canvas.emit('pointerdown');
  s.documentTarget.emit('pointermove', { clientX: 130 });
  assert.deepEqual(s.deltas, [[30, 0]]);
});

test('captured mouse uses relative movement and clicks only once', () => {
  const s = setup();
  s.documentTarget.pointerLockElement = s.canvas;
  s.documentTarget.emit('pointerlockchange');
  s.documentTarget.emit('mousemove', { movementX: -12, movementY: 8 });
  s.canvas.emit('pointerdown');
  s.documentTarget.emit('pointerup');
  assert.deepEqual(s.deltas, [[-12, 8]]);
  assert.equal(s.clicks.length, 1);
  assert.equal(s.modes.at(-1), 'locked');
});

test('pause during a drag stops motion and suppresses the pending click', () => {
  const s = setup();
  s.canvas.emit('pointerdown');
  s.setEnabled(false);
  s.documentTarget.emit('pointermove', { clientX: 160 });
  s.setEnabled(true);
  s.documentTarget.emit('pointerup');
  assert.deepEqual(s.deltas, []);
  assert.deepEqual(s.clicks, []);
});

test('a focused station accepts hammer clicks and right-click exit without rotating', () => {
  const s = setup();
  s.setCanLook(false);
  s.canvas.emit('pointerdown');
  s.documentTarget.emit('pointermove', { clientX: 180 });
  s.documentTarget.emit('pointerup');
  s.canvas.emit('pointerdown', { button: 2 });
  assert.equal(s.clicks.length, 1);
  assert.equal(s.secondary.length, 1);
  assert.deepEqual(s.deltas, []);
});

test('pointer cancellation and window blur do not leave a sticky drag', () => {
  const s = setup();
  for (const end of ['pointercancel', 'lostpointercapture']) {
    s.canvas.emit('pointerdown');
    (end === 'lostpointercapture' ? s.canvas : s.documentTarget).emit(end);
    s.documentTarget.emit('pointermove', { clientX: 150 });
  }
  s.canvas.emit('pointerdown');
  s.windowTarget.emit('blur');
  s.documentTarget.emit('pointermove', { clientX: 190 });
  assert.deepEqual(s.deltas, []);
  assert.deepEqual(s.clicks, []);
});

test('another pointer cannot move or finish the current drag', () => {
  const s = setup();
  s.canvas.emit('pointerdown');
  s.documentTarget.emit('pointermove', { pointerId: 2, clientX: 150 });
  s.documentTarget.emit('pointerup', { pointerId: 2 });
  s.documentTarget.emit('pointermove', { clientX: 140 });
  assert.deepEqual(s.deltas, [[40, 0]]);
});

test('release and dispose detach input and release pointer lock', () => {
  const s = setup();
  let exits = 0;
  s.documentTarget.pointerLockElement = s.canvas;
  s.documentTarget.exitPointerLock = () => { exits++; s.documentTarget.pointerLockElement = null; };
  s.input.release();
  assert.equal(exits, 1);
  s.canvas.emit('pointerdown');
  s.input.dispose();
  s.documentTarget.emit('pointermove', { clientX: 150 });
  s.canvas.emit('pointerdown');
  assert.deepEqual(s.deltas, []);
  assert.deepEqual(s.clicks, []);
});

test('a second canvas touch never replaces the live look gesture', () => {
  const s = setup();
  s.canvas.emit('pointerdown', { pointerType: 'touch' });
  s.canvas.emit('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200 });
  s.documentTarget.emit('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 260 });
  s.documentTarget.emit('pointerup', { pointerId: 2, pointerType: 'touch' });
  s.documentTarget.emit('pointermove', { pointerType: 'touch', clientX: 140 });
  assert.deepEqual(s.deltas, [[40, 0]]);
  s.input.dispose();
});

test('focused touch swipe never strikes, while a stationary tap strikes once on release', () => {
  const s = setup(); s.setCanLook(false);
  s.canvas.emit('pointerdown', { pointerType: 'touch' });
  assert.equal(s.clicks.length, 0);
  s.documentTarget.emit('pointermove', { pointerType: 'touch', clientX: 145 });
  s.documentTarget.emit('pointerup', { pointerType: 'touch', clientX: 145 });
  assert.equal(s.clicks.length, 0); assert.deepEqual(s.deltas, []);
  s.canvas.emit('pointerdown', { pointerType: 'touch' });
  assert.equal(s.clicks.length, 0);
  s.documentTarget.emit('pointerup', { pointerType: 'touch' });
  assert.equal(s.clicks.length, 1); s.input.dispose();
});

test('look reports touch input and a touch cannot request pointer lock', async () => {
  const types = []; const s = setup({ onLook: (_x, _y, type) => types.push(type) });
  let requests = 0; s.canvas.requestPointerLock = () => { requests++; };
  assert.equal(await s.input.requestLock('touch'), false); assert.equal(requests, 0);
  s.canvas.emit('pointerdown', { pointerType: 'touch' });
  s.documentTarget.emit('pointermove', { pointerType: 'touch', clientX: 125 });
  assert.deepEqual(types, ['touch']); s.input.dispose();
});

test('hidden page cancels a pending touch without a later accidental tap', () => {
  const s = setup(); s.canvas.emit('pointerdown', { pointerType: 'touch' });
  s.documentTarget.hidden = true; s.documentTarget.emit('visibilitychange');
  s.documentTarget.hidden = false; s.documentTarget.emit('pointerup', { pointerType: 'touch' });
  assert.equal(s.clicks.length, 0); s.input.dispose();
});

test('focused touch release coordinates reject a swipe even if no move event arrived', () => {
  const s = setup(); s.setCanLook(false);
  s.canvas.emit('pointerdown', { pointerType: 'touch' });
  s.documentTarget.emit('pointerup', { pointerType: 'touch', clientX: 155 });
  assert.equal(s.clicks.length, 0); s.input.dispose();
});
