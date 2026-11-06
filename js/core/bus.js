/**
 * Bus sự kiện đơn giản để các module giao tiếp mà không import vòng tròn.
 * Sự kiện chính: app:menu, net:lobby, net:start, net:error, net:closed, net:status.
 */
const bus = new EventTarget();

export function emitBus(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function onBus(type, fn) {
  const handler = (e) => fn(e.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}
