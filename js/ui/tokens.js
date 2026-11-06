/**
 * Quân cờ: đứng ở nửa "trước" của ô (gần camera), dạng biển đứng luôn quay mặt về camera.
 */
import { store, S } from '../core/store.js';
import { esc } from '../core/util.js';
import { isCorner, sideOf } from '../data/board.js';
import { dom, el } from './dom.js';
import { tileCenter } from './board3d.js';

let tokenEls = [];

export function buildTokens() {
  dom.tokens.innerHTML = '';
  const s = store.state;
  if (!s) {
    tokenEls = [];
    return;
  }
  tokenEls = s.players.map((p) => {
    const t = el('div', 'token');
    t.style.setProperty('--pc', p.color);
    // Nhân vật tròn trịa: đầu to mang gương mặt con vật, thân nhỏ có tay, hai bàn chân; nhún nhảy lệch nhịp nhau
    t.innerHTML = `<div class="tk-shadow"></div><div class="tk-bill"><div class="tk-bob"><div class="tk-pawn" style="animation-delay:${(-0.6 * p.id).toFixed(1)}s">` +
      '<div class="tk-feet"><i></i><i></i></div><div class="tk-body"><i class="tk-arm l"></i><i class="tk-arm r"></i></div>' +
      `<div class="tk-head">${esc(p.avatar)}</div><div class="tk-mark"></div></div></div></div>`;
    dom.tokens.appendChild(t);
    return t;
  });
  layoutTokens(true);
}

/** Điểm đặt quân trên ô (tọa độ cục bộ bàn cờ) */
function anchorOf(i, flat) {
  const c = tileCenter(i);
  if (flat || isCorner(i)) return { x: c.x, y: c.y, spread: 24 };
  const left = c.x - c.w / 2;
  const top = c.y - c.h / 2;
  // Cạnh trái/phải: nửa trước là phía -x; cạnh trên/dưới: nửa trước là phía +y
  if (sideOf(i) === 0 || sideOf(i) === 2) return { x: left + c.w * 0.27, y: c.y, spread: 17 };
  return { x: c.x, y: top + c.h * 0.74, spread: 17 };
}

export function layoutTokens(instant = false) {
  const s = store.state;
  if (!s || !tokenEls.length) return;
  const flat = document.body.classList.contains('view-2d');
  const occ = {};
  s.players.forEach((p) => {
    if (!p.bankrupt) (occ[p.pos] = occ[p.pos] || []).push(p.id);
  });
  s.players.forEach((p) => {
    const tk = tokenEls[p.id];
    if (!tk) return;
    tk.classList.toggle('gone', p.bankrupt);
    tk.classList.toggle('active', s.status === 'playing' && s.current === p.id);
    if (p.bankrupt) return;
    const list = occ[p.pos];
    const k = list.indexOf(p.id);
    const n = list.length;
    const a = anchorOf(p.pos, flat);
    let ox = 0;
    let oy = 0;
    if (n === 2) ox = k === 0 ? -a.spread : a.spread;
    else if (n >= 3) {
      ox = k % 2 === 0 ? -a.spread : a.spread;
      oy = k < 2 ? -a.spread : a.spread;
    }
    if (instant) tk.style.transition = 'none';
    tk.style.transform = `translate3d(${(a.x + ox).toFixed(1)}px, ${(a.y + oy).toFixed(1)}px, 0)`;
    if (instant) {
      void tk.offsetWidth;
      tk.style.transition = '';
    }
  });
}

export function hopToken(pid) {
  const tk = tokenEls[pid];
  if (!tk || S().fx === 0) return;
  tk.classList.remove('hop');
  void tk.offsetWidth;
  tk.classList.add('hop');
}

export function flyToken(pid, on) {
  const tk = tokenEls[pid];
  if (!tk) return;
  if (on && S().fly > 0) tk.classList.add('flying');
  else tk.classList.remove('flying');
  layoutTokens();
}
