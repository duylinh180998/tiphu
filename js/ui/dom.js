/**
 * Truy cập DOM & bộ nhớ đệm các phần tử chính.
 */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const dom = {};

export function cacheDom() {
  [
    ['scene', '#scene'],
    ['camera', '#camera'],
    ['board', '#board'],
    ['center', '#board-center'],
    ['tokens', '#token-layer'],
    ['diceTray', '#dice-tray'],
    ['hud', '#hud'],
    ['panels', '#panels'],
    ['overlayTop', '#overlay-top'],
    ['overlayBottom', '#overlay-bottom'],
    ['roundPill', '#round-pill'],
    ['festPill', '#festival-pill'],
    ['streetPill', '#street-pill'],
    ['inflPill', '#inflation-pill'],
    ['roomPill', '#room-pill'],
    ['status', '#stage-status'],
    ['actions', '#stage-actions'],
    ['hint', '#stage-hint'],
    ['timer', '#stage-timer'],
    ['logPanel', '#log-panel'],
    ['log', '#log'],
    ['dock', '#dock'],
    ['toolbar', '#toolbar'],
    ['tooltip', '#tooltip'],
    ['toasts', '#toast-root'],
    ['modalRoot', '#modal-root'],
    ['netBanner', '#net-banner'],
  ].forEach(([key, sel]) => {
    dom[key] = $(sel);
  });
}
