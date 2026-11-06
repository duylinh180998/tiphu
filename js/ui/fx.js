/**
 * Hiệu ứng: thông báo nổi, băng rôn lượt chơi, chữ bay trên ô, tiền bay trên thẻ, pháo giấy, biểu cảm.
 */
import { S } from '../core/store.js';
import { sleep } from '../core/session.js';
import { esc, fmtFull } from '../core/util.js';
import { dom, el } from './dom.js';
import { tileCenter } from './board3d.js';

export function toast(html, kind = 'info', ms = 2600) {
  if (!dom.toasts) return;
  const t = el('div', `toast toast-${kind}`, html);
  dom.toasts.appendChild(t);
  while (dom.toasts.children.length > 4) dom.toasts.firstElementChild.remove();
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 400);
  }, ms);
}

/** Băng rôn "Lượt của …" ở giữa bàn cờ; chờ theo tốc độ hiện hành */
export async function banner(p, sub) {
  const ms = S().banner;
  if (!ms || !p) return;
  const b = el('div', 'turn-banner', `<div class="tb-avatar">${esc(p.avatar)}</div><div><div class="tb-title">Lượt của ${esc(p.name)}</div><div class="tb-sub">${sub}</div></div>`);
  b.style.setProperty('--pc', p.color);
  dom.scene.appendChild(b);
  try {
    await sleep(ms);
  } finally {
    b.classList.add('out');
    setTimeout(() => b.remove(), 350);
  }
}

/** Chữ/biểu tượng bay lên từ một ô (biển đứng trong không gian 3D) */
export function tileFx(i, html, kind = '') {
  if (S().fx === 0) return;
  const c = tileCenter(i);
  const a = el('div', 'fx-anchor');
  a.style.transform = `translate3d(${c.x}px, ${c.y}px, 20px)`;
  a.innerHTML = `<div class="bb"><div class="bb-in"><div class="fx-pop ${kind}">${html}</div></div></div>`;
  dom.tokens.appendChild(a);
  setTimeout(() => a.remove(), 1600);
}

export function moneyFx(card, delta) {
  if (!card || !delta || S().fx === 0) return;
  const f = el('div', `money-fx ${delta > 0 ? 'gain' : 'loss'}`, `${delta > 0 ? '+' : '−'}${fmtFull(Math.abs(delta))}`);
  card.appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

export function emoteFx(card, emoji) {
  if (!card) return;
  const b = el('div', 'emote-bubble', esc(emoji));
  card.appendChild(b);
  setTimeout(() => b.remove(), 2600);
}

export function confetti() {
  const wrap = el('div', 'confetti');
  const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#fbbf24', '#06b6d4'];
  for (let k = 0; k < 90; k++) {
    const c = el('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[k % colors.length];
    c.style.animationDelay = `${Math.random() * 1.2}s`;
    c.style.animationDuration = `${2.4 + Math.random() * 2}s`;
    c.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    c.style.setProperty('--dx', `${Math.random() * 200 - 100}px`);
    wrap.appendChild(c);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 5200);
}
