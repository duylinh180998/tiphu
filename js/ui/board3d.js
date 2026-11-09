/**
 * Dựng bàn cờ 9x9 (CSS Grid) đặt nghiêng thành góc nhìn isometric 3D.
 * - Mặt chữ của ô cạnh trái/phải được xoay 90° để chữ chạy dọc theo cạnh và luôn đọc được từ camera.
 * - Công trình 3D đứng ở phía "sau" ô (xa camera) để không che tên và giá.
 * - Chế độ 2D: bỏ nghiêng, mặt chữ trở về nằm ngang như bàn cờ phẳng.
 */
import { TILES, GROUPS, gridPos, isCorner, sideOf } from '../data/board.js';
import { LEVEL_ICONS, RESORT_PRICE, LANDMARK, STREET_FEST_MULT } from '../config.js';
import { store } from '../core/store.js';
import { esc, fmt } from '../core/util.js';
import { rentOf, hasMonopoly, isOutage, isStreetFest } from '../game/rules.js';
import { dom, el } from './dom.js';
import { cityModel, resortModel, billboard } from './models.js';

/** Kích thước bàn cờ (px cục bộ, trước khi thu phóng) */
export const GEO = { C: 150, E: 100, GAP: 5, PAD: 12 };
export const BOARD_PX = 2 * GEO.C + 7 * GEO.E + 8 * GEO.GAP + 2 * GEO.PAD;

let tileEls = [];
const modelKeys = [];

export const tileEl = (i) => tileEls[i];
export const allTiles = () => tileEls;

function faceHTML(t) {
  const nameCls = t.name.length >= 9 ? 'name long' : 'name';
  switch (t.type) {
    case 'city':
      return `<div class="tile-face"><div class="band"><span class="lvl"></span><span class="mono-tag" title="Độc quyền nhóm màu: thuê x2">x2</span></div><div class="label"><div class="${nameCls}">${esc(t.name)}</div><div class="price"></div><div class="tags"></div></div></div><div class="lot"></div>`;
    case 'resort':
      return `<div class="tile-face"><div class="band band-resort"><span class="lvl">🏖️</span></div><div class="label"><div class="beach-ico">🌴⛱️</div><div class="${nameCls}">${esc(t.name)}</div><div class="price"></div></div></div><div class="lot"></div>`;
    case 'chance':
      return `<div class="tile-face"><div class="label special"><div class="icon">${t.icon}</div><div class="name">${t.name}</div></div></div>`;
    case 'tax':
      return `<div class="tile-face"><div class="label special"><div class="icon">${t.icon}</div><div class="name">${t.name}</div><div class="sub">${t.sub}</div></div></div>`;
    default:
      return `<div class="tile-face corner-face"><div class="corner-label"><div class="icon">${t.icon}</div><div class="name">${t.label}</div><div class="sub">${t.sub}</div></div></div>` +
        `<div class="corner-prop">${billboard(0, 0, t.prop, 'bb-prop')}</div>`;
  }
}

/** Tạo 32 ô. handlers: { click(i), enter(i), leave(i) } */
export function buildBoard(handlers) {
  tileEls.forEach((e) => e.remove());
  tileEls = TILES.map((t, i) => {
    const { row, col } = gridPos(i);
    const side = isCorner(i) ? 'corner' : `s${sideOf(i)}`;
    const e = el('div', `tile t-${t.type} ${side}`);
    e.dataset.i = String(i);
    e.style.gridRow = String(row);
    e.style.gridColumn = String(col);
    if (t.type === 'city') e.style.setProperty('--g', GROUPS[t.group].color);
    e.setAttribute('role', 'button');
    e.setAttribute('aria-label', t.name);
    e.innerHTML = faceHTML(t);
    e.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handlers.click(i);
    });
    e.addEventListener('mouseenter', () => handlers.enter(i));
    e.addEventListener('mouseleave', () => handlers.leave(i));
    dom.board.insertBefore(e, dom.center);
    return e;
  });
  modelKeys.length = 0;
}

/** Tâm ô theo tọa độ cục bộ của bàn cờ (không phụ thuộc phép xoay/thu phóng) */
export function tileCenter(i) {
  const t = tileEls[i];
  return { x: t.offsetLeft + t.offsetWidth / 2, y: t.offsetTop + t.offsetHeight / 2, w: t.offsetWidth, h: t.offsetHeight };
}

export function renderTiles() {
  const s = store.state;
  TILES.forEach((t, i) => {
    const e = tileEls[i];
    if (!e || (t.type !== 'city' && t.type !== 'resort')) return;
    const pr = s ? s.props[i] : null;
    const owner = pr && pr.owner != null ? s.players[pr.owner] : null;
    e.classList.toggle('owned', !!owner);
    e.classList.toggle('landmark', !!owner && t.type === 'city' && pr.level === LANDMARK);
    if (owner) e.style.setProperty('--owner', owner.color);
    else e.style.removeProperty('--owner');
    if (t.type === 'city') e.querySelector('.lvl').textContent = owner ? LEVEL_ICONS[pr.level] : '';
    const price = e.querySelector('.price');
    if (owner) {
      price.innerHTML = `<span class="pav">${esc(owner.avatar)}</span>${fmt(rentOf(i))}`;
      price.classList.add('rent');
    } else {
      price.textContent = fmt(t.type === 'resort' ? RESORT_PRICE : t.eco.value[1]);
      price.classList.remove('rent');
    }
    const key = `${owner ? `${pr.level}:${owner.color}` : ''}`;
    if (modelKeys[i] !== key) {
      modelKeys[i] = key;
      const lot = e.querySelector('.lot');
      if (t.type === 'resort') lot.innerHTML = resortModel(owner ? owner.color : null);
      else lot.innerHTML = owner ? cityModel(pr.level, owner.color) : '';
    }
    if (t.type === 'city') {
      e.classList.toggle('mono', !!s && hasMonopoly(i));
      const fest = !!s && s.festival.tile === i;
      const street = !!s && !fest && isStreetFest(i);
      const out = !!s && isOutage(i);
      e.classList.toggle('festival', fest);
      e.classList.toggle('street-fest', street);
      e.classList.toggle('outage', out);
      // Nhãn in phẳng ngay dưới giá thuê của chính ô đó: không bị công trình che, không nhầm ô
      const tags = (fest ? `<span class="tag tag-fest">🎉 x${s.festival.mult}</span>` : '') + (street ? `<span class="tag tag-street">🎊 x${STREET_FEST_MULT} · ${s.street.left}v</span>` : '') + (out ? `<span class="tag tag-out">🔌 ${pr.outage} vòng</span>` : '');
      const box = e.querySelector('.tags');
      if (box.dataset.v !== tags) {
        box.dataset.v = tags;
        box.innerHTML = tags;
      }
    }
  });
}

/**
 * Đánh dấu các ô được phép chọn (null để tắt chế độ chọn).
 * pinFor(i) (tùy chọn) trả về HTML của ghim trên ô, mặc định là mũi tên ▼; picked là các ô đã chọn
 * (chế độ chọn nhiều, ví dụ bán tài sản).
 */
export function setSelectable(cands, { pinFor = null, picked = null } = {}) {
  const set = cands ? new Set(cands) : null;
  dom.board.classList.toggle('selecting', !!set);
  tileEls.forEach((e, i) => {
    const on = !!set && set.has(i);
    e.classList.toggle('selectable', on);
    e.classList.toggle('picked', on && !!picked && picked.has(i));
    // Ghim vàng ▼ đứng phía trên ô để nhìn từ xa cũng thấy ô nào chọn được
    let pin = e.querySelector(':scope > .sel-pin');
    if (!on) {
      if (pin) pin.remove();
      return;
    }
    const html = pinFor ? pinFor(i) : '<div class="pin">▼</div>';
    if (!pin) {
      pin = el('div', 'sel-pin');
      e.appendChild(pin);
    }
    if (pin.dataset.v !== html) {
      pin.dataset.v = html;
      pin.innerHTML = billboard(0, 0, html, 'bb-pin');
    }
  });
}

export function pulseTile(i) {
  const e = tileEls[i];
  if (!e) return;
  e.classList.remove('pulse');
  void e.offsetWidth;
  e.classList.add('pulse');
  setTimeout(() => e.classList.remove('pulse'), 800);
}

export function markChosen(i, on) {
  const e = tileEls[i];
  if (e) e.classList.toggle('chosen', on);
}
