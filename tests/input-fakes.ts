import type { InputEventMap, PointerInputEvent } from '../src/mouse-look.ts';

type SurfaceEvent = PointerInputEvent & { movementX: number; movementY: number };
type Listener = (event: SurfaceEvent) => void;

// A test surface implements only the events and properties used by the controls.
export class Surface {
  listeners = new Map<string, Set<Listener>>();
  style = {cursor: '', transform: ''};
  ownerDocument: Surface = this;
  defaultView: Surface | null = null;
  hidden = false;
  pointerLockElement: object | null = null;
  capture: number | null = null;
  requestPointerLock?: () => void | Promise<void>;
  exitPointerLock?: () => void;
  querySelector?: (selector: string) => Surface | null;

  constructor(private readonly pointerType = 'mouse') {}

  addEventListener(type: string, fn: Listener) {
    let listeners = this.listeners.get(type);
    if (!listeners) {listeners = new Set(); this.listeners.set(type, listeners);}
    listeners.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {this.listeners.get(type)?.delete(fn);}
  emit(type: keyof InputEventMap, extra: Partial<SurfaceEvent> = {}) {
    const event: SurfaceEvent = {button: 0, pointerId: 1, pointerType: this.pointerType,
      clientX: 100, clientY: 100, movementX: 0, movementY: 0, preventDefault() {}, ...extra};
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  getBoundingClientRect() {return {left: 50, top: 50, width: 100, height: 100};}
  setPointerCapture(id: number) {this.capture = id;}
  hasPointerCapture(id: number) {return this.capture === id;}
  releasePointerCapture() {this.capture = null;}
}
