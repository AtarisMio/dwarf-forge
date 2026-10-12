// Pointer Lock is optional: embedded browsers can always turn the camera by
// dragging. A drag must never be mistaken for a click on a workshop station.
export function createMouseLook(canvas, options = {}) {
  const {
    documentTarget = canvas.ownerDocument,
    windowTarget = documentTarget.defaultView,
    enabled = () => true, canLook = () => true,
    onLook = () => {}, onClick = () => {}, onSecondary = () => {}, onMode = () => {},
  } = options;
  const removers = [];
  let drag = null, disposed = false;
  const locked = () => documentTarget.pointerLockElement === canvas;
  const active = () => !disposed && !documentTarget.hidden && enabled();
  function listen(target, type, fn) {
    target.addEventListener(type, fn);
    removers.push(() => target.removeEventListener(type, fn));
  }
  function mode() {
    const value = locked() ? 'locked' : 'drag';
    canvas.style.cursor = locked() ? 'none' : drag?.moved ? 'grabbing' : 'grab';
    canvas.setAttribute?.('data-look-mode', value);
    onMode(value);
  }
  function reset() {
    const previous = drag; drag = null;
    if (previous && canvas.hasPointerCapture?.(previous.id)) {
      try { canvas.releasePointerCapture(previous.id); } catch { /* Capture may have ended on blur. */ }
    }
    canvas.style.cursor = locked() ? 'none' : 'grab';
  }
  function release() {
    reset();
    if (locked()) documentTarget.exitPointerLock?.();
  }
  async function requestLock(pointerType = 'mouse') {
    if (pointerType === 'touch' || !active() || !canLook() || typeof canvas.requestPointerLock !== 'function') {
      if (!disposed) mode();
      return false;
    }
    try {
      await canvas.requestPointerLock();
      return true;
    } catch {
      // Denial is a supported mode, rather than a dead input path.
      if (!disposed) mode();
      return false;
    }
  }
  listen(canvas, 'pointerdown', event => {
    if (!active()) return;
    if (drag && event.pointerId !== drag.id) return;
    if (event.button === 2) { onSecondary(event); return; }
    if (event.button !== 0) return;
    canvas.focus?.({ preventScroll: true });
    const pointerType = event.pointerType || 'mouse';
    if (pointerType !== 'touch' && (locked() || !canLook())) { onClick(event); return; }
    drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastY: event.clientY, moved: false, pointerType, event };
    try { canvas.setPointerCapture?.(event.pointerId); } catch { /* Document listeners still finish the gesture. */ }
    event.preventDefault();
  });
  listen(documentTarget, 'pointermove', event => {
    if (!active()) { reset(); return; }
    if (!canLook() && drag?.pointerType !== 'touch') { reset(); return; }
    if (locked() || !drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < (drag.pointerType === 'touch' ? 8 : 4)) return;
    drag.moved = true;
    const dx = event.clientX - drag.lastX, dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    canvas.style.cursor = 'grabbing';
    if (canLook()) onLook(dx, dy, drag.pointerType);
    event.preventDefault();
  });
  listen(documentTarget, 'pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const previous = drag; reset();
    const distance = Math.hypot(event.clientX - previous.startX, event.clientY - previous.startY);
    if (active() && !previous.moved && distance < (previous.pointerType === 'touch' ? 8 : 4) && (canLook() || previous.pointerType === 'touch')) onClick(previous.event);
  });
  listen(documentTarget, 'pointercancel', event => { if (drag?.id === event.pointerId) reset(); });
  listen(canvas, 'lostpointercapture', event => { if (drag?.id === event.pointerId) reset(); });
  listen(documentTarget, 'mousemove', event => {
    if (active() && canLook() && locked()) onLook(event.movementX || 0, event.movementY || 0, 'mouse');
  });
  listen(documentTarget, 'pointerlockchange', () => { reset(); mode(); });
  listen(documentTarget, 'pointerlockerror', () => { reset(); mode(); });
  listen(windowTarget, 'blur', release);
  listen(documentTarget, 'visibilitychange', () => { if (documentTarget.hidden) release(); });
  mode();
  return {
    requestLock, release,
    dispose() {
      if (disposed) return;
      release(); disposed = true; removers.forEach(remove => remove());
      canvas.style.cursor = '';
    },
  };
}
