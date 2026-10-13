import type { InputDocument, InputEventMap, InputEventTarget, PointerInputEvent } from './mouse-look.ts';

interface MovementKnob { readonly style: Pick<CSSStyleDeclaration, 'transform'>; }
export interface TouchMovementSurface extends InputEventTarget<'pointerdown' | 'lostpointercapture'> {
  readonly ownerDocument: InputDocument;
  querySelector?(selector: string): Element | MovementKnob | null;
  getBoundingClientRect(): Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  hasPointerCapture?(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
  setPointerCapture?(pointerId: number): void;
}
export interface TouchMovementOptions {
  documentTarget?: InputDocument;
  windowTarget?: InputEventTarget<'blur'> | null;
  enabled?: () => boolean;
}
export interface TouchMovementControl {
  read(): {x: number; y: number};
  reset(): void;
  dispose(): void;
}
interface MovementGesture {id: number; centerX: number; centerY: number; radius: number;}

// This control owns only a pad gesture. The canvas look control owns a separate
// pointer, so moving and looking work simultaneously with two fingers.
export function createTouchMovement(padTarget: TouchMovementSurface | null, options: TouchMovementOptions = {}): TouchMovementControl {
  if (!padTarget) return { read: () => ({ x: 0, y: 0 }), reset() {}, dispose() {} };
  const pad = padTarget;
  const {
    documentTarget = pad.ownerDocument,
    windowTarget = documentTarget.defaultView,
    enabled = () => true,
  } = options;
  const knob = pad.querySelector?.('#touch-move-knob');
  const removers: (() => void)[] = [];
  let gesture: MovementGesture | null = null;
  let disposed = false, x = 0, y = 0;
  const active = () => !disposed && !documentTarget.hidden && enabled();
  function listen<K extends keyof InputEventMap>(target: InputEventTarget<K> | null, type: K, fn: (event: InputEventMap[K]) => void) {
    if (!target) return;
    target.addEventListener(type, fn, { passive: false });
    removers.push(() => target.removeEventListener(type, fn));
  }
  function draw(dx: number, dy: number) { if (knob && 'style' in knob) knob.style.transform = `translate(${dx}px, ${dy}px)`; }
  function reset() {
    const previous = gesture; gesture = null; x = 0; y = 0; draw(0, 0);
    if (previous && pad.hasPointerCapture?.(previous.id)) {
      try { pad.releasePointerCapture(previous.id); } catch { /* Capture may already have been cancelled. */ }
    }
  }
  function move(event: PointerInputEvent) {
    if (!active()) { reset(); return; }
    if (!gesture || event.pointerId !== gesture.id) return;
    let dx = (event.clientX - gesture.centerX) / gesture.radius;
    let dy = (event.clientY - gesture.centerY) / gesture.radius;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) { dx /= distance; dy /= distance; }
    // Small central motion is a dead zone, rather than involuntary walking.
    const magnitude = Math.min(1, distance);
    const strength = Math.max(0, (magnitude - .08) / .92);
    x = magnitude ? dx / magnitude * strength : 0;
    y = magnitude ? dy / magnitude * strength : 0;
    draw(dx * gesture.radius, dy * gesture.radius); event.preventDefault();
  }
  listen(pad, 'pointerdown', event => {
    if (!active() || gesture || event.button !== 0) return;
    const rect = pad.getBoundingClientRect();
    gesture = { id: event.pointerId, centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2, radius: Math.max(1, Math.min(rect.width, rect.height) * .32) };
    try { pad.setPointerCapture?.(event.pointerId); } catch { /* Document listeners remain usable. */ }
    move(event);
  });
  listen(documentTarget, 'pointermove', move);
  for (const type of ['pointerup', 'pointercancel'] as const) listen(documentTarget, type, event => { if (gesture?.id === event.pointerId) reset(); });
  listen(pad, 'lostpointercapture', event => { if (gesture?.id === event.pointerId) reset(); });
  listen(windowTarget, 'blur', reset);
  listen(documentTarget, 'visibilitychange', () => { if (documentTarget.hidden) reset(); });
  draw(0, 0);
  return {
    read() { if (!active()) reset(); return { x, y }; }, reset,
    dispose() { if (disposed) return; reset(); disposed = true; removers.forEach(remove => remove()); },
  };
}
