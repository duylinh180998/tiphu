/**
 * Tiền trên bàn cờ:
 * - Chồng tiền của mỗi người chơi đặt cạnh bàn cờ, phía thẻ của người đó; cao thấp theo số tiền mặt.
 * - Hiệu ứng chuyển tiền: tờ tiền bay từ người trả ra giữa bàn cờ rồi bay tới người nhận
 *   (ngân hàng nằm ở giữa bàn cờ: mua đất thì tiền dừng ở giữa, nhận lương thì tiền bay từ giữa ra).
 */
import { store, S } from '../core/store.js';
import { esc, fmt } from '../core/util.js';
import { dom, el } from './dom.js';
import { BOARD_PX } from './board3d.js';
import { panelOf } from './hud.js';

const PER_BUNDLE = 200; // mỗi cọc tiền ứng với $200K
const MAX_BUNDLES = 30;
const PILE_H = 5; // số cọc tối đa trong một chồng
const OUT = 86; // khoảng cách từ mép bàn cờ ra chồng tiền (px cục bộ)
// Vị trí theo thứ tự người chơi 0..3: khớp với 4 thẻ người chơi ở 4 góc màn hình
const SPOTS = [
  { x: -OUT, y: BOARD_PX * 0.5 },
  { x: BOARD_PX * 0.5, y: -OUT },
  { x: BOARD_PX + OUT, y: BOARD_PX * 0.5 },
  { x: BOARD_PX * 0.5, y: BOARD_PX + OUT },
];

const stackEls = [];
const keys = [];

/** Một cọc tiền góc nhìn nghiêng: mặt trên xanh có đai giấy, hai mặt bên đậm hơn */
function bundle(cx, cy) {
  const a = 17;
  const b = 8.5;
  const h = 6;
  const top = `${cx},${cy - b} ${cx + a},${cy} ${cx},${cy + b} ${cx - a},${cy}`;
  const left = `${cx - a},${cy} ${cx},${cy + b} ${cx},${cy + b + h} ${cx - a},${cy + h}`;
  const right = `${cx},${cy + b} ${cx + a},${cy} ${cx + a},${cy + h} ${cx},${cy + b + h}`;
  return `<polygon points="${left}" fill="#15803d"/><polygon points="${right}" fill="#16a34a"/>` +
    `<polygon points="${top}" fill="#4ade80" stroke="#166534" stroke-width=".7" stroke-linejoin="round"/>` +
    `<polygon points="${cx - a * 0.3},${cy - b * 0.7} ${cx + a * 0.7},${cy + b * 0.3} ${cx + a * 0.3},${cy + b * 0.7} ${cx - a * 0.7},${cy - b * 0.3}" fill="#fef9c3" stroke="#ca8a04" stroke-width=".5"/>` +
    `<line x1="${cx - a}" y1="${cy + 3}" x2="${cx}" y2="${cy + b + 3}" stroke="#bbf7d0" stroke-width=".6"/><line x1="${cx}" y1="${cy + b + 3}" x2="${cx + a}" y2="${cy + 3}" stroke="#bbf7d0" stroke-width=".6"/>`;
}

function stackSVG(n) {
  const W = 110;
  const H = 96;
  const piles = Math.max(1, Math.ceil(n / PILE_H));
  // Lưới 3 x 2 chồng, vẽ từ xa tới gần để chồng gần che chồng xa
  const cells = [];
  for (let k = 0; k < piles; k++) cells.push({ col: k % 3, row: Math.floor(k / 3), k });
  cells.sort((p, q) => p.col + p.row - (q.col + q.row));
  let body = '';
  cells.forEach(({ col, row, k }) => {
    const count = Math.min(PILE_H, n - k * PILE_H);
    const bx = 55 + (col - row) * 19 - 9;
    const by = 62 + (col + row) * 9.5;
    for (let j = 0; j < count; j++) body += bundle(bx, by - j * 6.4);
  });
  return `<svg class="cash-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
}

/** Vẽ lại chồng tiền của từng người chơi (gọi mỗi lần đồng bộ trạng thái) */
export function renderCashStacks() {
  const s = store.state;
  for (let pid = 0; pid < 4; pid++) {
    const p = s ? s.players[pid] : null;
    let e = stackEls[pid];
    if (!p || p.bankrupt) {
      if (e) e.remove();
      stackEls[pid] = null;
      keys[pid] = '';
      continue;
    }
    if (!e || !e.isConnected) {
      e = el('div', 'cash-stack');
      e.dataset.pid = String(pid);
      e.style.transform = `translate3d(${SPOTS[pid].x}px, ${SPOTS[pid].y}px, -20px)`;
      dom.tokens.appendChild(e);
      stackEls[pid] = e;
      keys[pid] = '';
    }
    const n = Math.min(MAX_BUNDLES, Math.max(p.money > 0 ? 1 : 0, Math.round(p.money / PER_BUNDLE)));
    const key = `${n}|${p.money}|${p.color}|${p.avatar}`;
    if (keys[pid] === key) continue;
    keys[pid] = key;
    e.innerHTML = `<div class="bb"><div class="bb-in bb-cash">${n ? stackSVG(n) : ''}<div class="cash-tag" style="--pc:${p.color}">${esc(p.avatar)} ${fmt(p.money)}</div></div></div>`;
  }
}

// ---------- Tiền bay ----------
const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Điểm trên màn hình của một người chơi: chồng tiền nếu đang thấy, không thì thẻ người chơi */
function pointOf(pid) {
  if (pid == null) {
    const r = dom.center.getBoundingClientRect();
    return centerOf(r);
  }
  const st = stackEls[pid] && stackEls[pid].querySelector('.bb-cash');
  if (st) {
    const r = st.getBoundingClientRect();
    if (r.width > 4 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) return centerOf(r);
  }
  const card = panelOf(pid);
  return card ? centerOf(card.getBoundingClientRect()) : null;
}

function flyBill(from, to, delay, ms, layer) {
  const b = el('div', 'cash-bill', '<i></i>');
  const jx = (Math.random() - 0.5) * 26;
  const jy = (Math.random() - 0.5) * 18;
  b.style.left = `${from.x}px`;
  b.style.top = `${from.y}px`;
  layer.appendChild(b);
  const dx = to.x - from.x + jx;
  const dy = to.y - from.y + jy;
  const lift = -Math.min(90, 30 + Math.hypot(dx, dy) * 0.18);
  const rot = (Math.random() - 0.5) * 50;
  const anim = b.animate([
    { transform: 'translate(-50%, -50%) scale(.5)', opacity: 0 },
    { transform: `translate(-50%, -50%) translate(${dx * 0.1}px, ${dy * 0.1}px) scale(1)`, opacity: 1, offset: 0.12 },
    { transform: `translate(-50%, -50%) translate(${dx * 0.55}px, ${dy * 0.55 + lift}px) rotate(${rot}deg) scale(1.15)`, opacity: 1, offset: 0.55 },
    { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${rot * 0.3}deg) scale(.9)`, opacity: 1 },
  ], { duration: ms, delay, easing: 'cubic-bezier(.4, .1, .3, 1)', fill: 'both' });
  return anim.finished.catch(() => {}).then(() => b);
}

/**
 * Chuyển tiền: from → giữa bàn cờ → to. from/to là mã người chơi hoặc null (ngân hàng ở giữa bàn cờ).
 */
export function cashFly(from, to, amount) {
  if (S().fx === 0 || !amount || document.hidden) return;
  const mid = pointOf(null);
  const a = from != null ? pointOf(from) : mid;
  const z = to != null ? pointOf(to) : mid;
  if (!a || !z || !mid) return;
  let layer = document.getElementById('cash-layer');
  if (!layer) {
    layer = el('div');
    layer.id = 'cash-layer';
    document.body.appendChild(layer);
  }
  // Màn hình nhỏ (bàn cờ thu nhỏ) thì tờ tiền cũng nhỏ theo
  const k0 = Math.max(0.45, Math.min(1, dom.center.getBoundingClientRect().width / 620));
  layer.style.setProperty('--ck', k0.toFixed(2));
  const count = Math.max(3, Math.min(9, Math.round(amount / 80) + 2));
  const leg = Math.max(260, Math.min(620, S().fly * 0.75));
  const twoLegs = from != null && to != null;
  for (let k = 0; k < count; k++) {
    const delay = k * 55;
    if (twoLegs) {
      flyBill(a, mid, delay, leg, layer).then((b) => {
        b.remove();
        // Nghỉ một nhịp ở giữa bàn cờ rồi bay tiếp tới người nhận
        return flyBill(mid, z, 140, leg, layer);
      }).then((b) => b.remove());
    } else {
      flyBill(a, z, delay, leg, layer).then((b) => {
        b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished.catch(() => {}).then(() => b.remove());
      });
    }
  }
  // Số tiền hiện ở giữa bàn cờ
  const label = el('div', 'cash-amount', fmt(amount));
  label.style.left = `${mid.x}px`;
  label.style.top = `${mid.y}px`;
  layer.appendChild(label);
  setTimeout(() => label.remove(), twoLegs ? leg * 2 + 500 : leg + 500);
}
