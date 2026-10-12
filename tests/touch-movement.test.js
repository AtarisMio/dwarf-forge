import test from 'node:test';
import assert from 'node:assert/strict';
import { createTouchMovement } from '../src/touch-movement.js';
import { createMouseLook } from '../src/mouse-look.js';

class Surface {
  listeners = new Map(); style = {};
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, extra = {}) { const e = { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100, preventDefault() {}, ...extra }; for (const fn of this.listeners.get(type) || []) fn(e); }
  getBoundingClientRect() { return { left: 50, top: 50, width: 100, height: 100 }; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}
function setup() {
  const documentTarget = new Surface(), windowTarget = new Surface(), pad = new Surface(), knob = new Surface();
  pad.ownerDocument = documentTarget; pad.querySelector = () => knob;
  let enabled = true;
  const input = createTouchMovement(pad, { documentTarget, windowTarget, enabled: () => enabled });
  return { input, documentTarget, windowTarget, pad, knob, setEnabled: v => { enabled = v; } };
}
test('joystick preserves analog magnitude, clamps diagonal radius and recenters on release', () => {
  const s = setup(); s.pad.emit('pointerdown');
  s.documentTarget.emit('pointermove', { clientX: 101 }); assert.deepEqual(s.input.read(), { x:0,y:0 }, 'central dead zone does not move the player');
  s.documentTarget.emit('pointermove', { clientX: 112 });
  assert.ok(s.input.read().x > 0 && s.input.read().x < 1); assert.equal(s.input.read().y, 0);
  s.documentTarget.emit('pointermove', { clientX: 220, clientY: -20 });
  const axis = s.input.read(); assert.ok(Math.abs(Math.hypot(axis.x, axis.y) - 1) < 1e-8); assert.ok(axis.x > 0 && axis.y < 0);
  s.documentTarget.emit('pointerup'); assert.deepEqual(s.input.read(), { x: 0, y: 0 });
  assert.equal(s.knob.style.transform, 'translate(0px, 0px)'); s.input.dispose();
});

test('desktop hosts can omit the touch surface', () => {
  const input = createTouchMovement(null);
  assert.deepEqual(input.read(), { x:0,y:0 }); input.reset(); input.dispose();
});
test('pad and canvas hold two independent fingers simultaneously', () => {
  const s = setup(), canvas = new Surface(); canvas.ownerDocument = s.documentTarget;
  const looks = []; const look = createMouseLook(canvas, { documentTarget: s.documentTarget, windowTarget: s.windowTarget, onLook: (x,y) => looks.push([x,y]) });
  s.pad.emit('pointerdown'); canvas.emit('pointerdown', { pointerId: 2 });
  s.documentTarget.emit('pointermove', { clientY: 65 });
  s.documentTarget.emit('pointermove', { pointerId: 2, clientX: 135 });
  assert.ok(s.input.read().y < -.9); assert.deepEqual(looks, [[35,0]]);
  s.documentTarget.emit('pointerup', { pointerId: 2 }); assert.ok(s.input.read().y < -.9);
  s.documentTarget.emit('pointerup'); assert.deepEqual(s.input.read(), { x:0,y:0 }); look.dispose(); s.input.dispose();
});
test('another pad pointer cannot replace or finish movement', () => {
  const s = setup(); s.pad.emit('pointerdown'); s.pad.emit('pointerdown', { pointerId: 2 });
  s.documentTarget.emit('pointermove', { pointerId: 2, clientX: 150 }); assert.deepEqual(s.input.read(), { x:0,y:0 });
  s.documentTarget.emit('pointermove', { clientX: 150 }); s.documentTarget.emit('pointerup', { pointerId: 2 }); assert.equal(s.input.read().x, 1); s.input.dispose();
});
test('pause, explicit focus reset, cancellation, capture loss, blur and hidden page cannot leave motion held', () => {
  const s = setup();
  for (const reason of ['pause','reset','pointercancel','lostpointercapture','blur','hidden']) {
    s.pad.emit('pointerdown'); s.documentTarget.emit('pointermove', { clientX: 150 });
    if (reason === 'pause') { s.setEnabled(false); assert.deepEqual(s.input.read(), { x:0,y:0 }); s.setEnabled(true); }
    else if (reason === 'reset') s.input.reset();
    else if (reason === 'blur') s.windowTarget.emit('blur');
    else if (reason === 'hidden') { s.documentTarget.hidden = true; s.documentTarget.emit('visibilitychange'); s.documentTarget.hidden = false; }
    else (reason === 'lostpointercapture' ? s.pad : s.documentTarget).emit(reason);
    assert.deepEqual(s.input.read(), { x:0,y:0 }, reason);
    s.documentTarget.emit('pointermove', { clientX: 150 }); assert.deepEqual(s.input.read(), { x:0,y:0 }, `${reason} cannot resume old gesture`);
  }
  s.input.dispose(); s.pad.emit('pointerdown'); s.documentTarget.emit('pointermove', { clientX: 150 }); assert.deepEqual(s.input.read(), { x:0,y:0 });
  assert.ok([...s.pad.listeners.values(),...s.documentTarget.listeners.values(),...s.windowTarget.listeners.values()].every(set=>set.size===0));
});
