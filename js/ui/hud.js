/**
 * HUD trên màn hình: 4 thẻ người chơi ở 4 góc, nhãn vòng/lễ hội/lạm phát,
 * dòng trạng thái + nút hành động ở giữa bàn cờ, đồng hồ đếm giờ và nhật ký.
 */
import { store, S } from '../core/store.js';
import { esc, fmt, fmtFull } from '../core/util.js';
import { humanWait } from '../core/session.js';
import { TILES } from '../data/board.js';
import { ownedBy, netWorth, completedGroups, resortCount, inflationPct, isBot } from '../game/rules.js';
import { dom, el } from './dom.js';
import { beginPrompt } from './prompt.js';
import { Sound } from './audio.js';
import { moneyFx, emoteFx } from './fx.js';

let cardEls = [];
let onCardClick = () => {};

export const panelOf = (pid) => cardEls[pid];

export function setPanelClick(fn) {
  onCardClick = fn;
}

function typeLabel(p) {
  if (store.role !== 'local' && p.id === store.myId) return '⭐ Bạn';
  if (isBot(p)) return '🤖 Máy';
  if (p.type === 'remote') return '🌐 Trực tuyến';
  if (store.role === 'guest') return '👑 Chủ phòng';
  return '👤 Người chơi';
}

export function buildPanels() {
  cardEls.forEach((e) => e.remove());
  cardEls = [];
  const s = store.state;
  for (let slot = 0; slot < 4; slot++) {
    const p = s ? s.players[slot] : null;
    const c = el('div', `pcard slot-${slot}`);
    if (!p) {
      c.classList.add('empty');
      c.innerHTML = '<div class="pc-empty">Ghế trống</div>';
    } else {
      c.style.setProperty('--pc', p.color);
      c.innerHTML = `
        <div class="pc-top">
          <div class="pc-avatar">${esc(p.avatar)}<span class="pc-net"></span></div>
          <div class="pc-id">
            <div class="pc-name">${esc(p.name)}</div>
            <div class="pc-type"></div>
          </div>
          <div class="pc-turn" aria-hidden="true">▶</div>
        </div>
        <div class="pc-money" data-v="${p.money}">${fmtFull(p.money)}</div>
        <div class="pc-sub"><span class="pc-props"></span><span class="pc-worth"></span></div>
        <div class="pc-status"></div>`;
      c.title = 'Xem tài sản';
      c.addEventListener('click', () => onCardClick(p.id));
    }
    cardEls.push(c);
  }
}

/** Gắn các thẻ người chơi vào khung HUD (màn rộng) hoặc dock (màn nhỏ) */
export function placePanels(docked) {
  const target = docked ? dom.dock : dom.panels;
  cardEls.forEach((c) => target.appendChild(c));
  (docked ? dom.dock : dom.hud).appendChild(dom.logPanel);
}

function animateMoney(node, value) {
  const from = Number(node.dataset.v);
  cancelAnimationFrame(node._raf);
  if (!Number.isFinite(from) || from === value || S().fx === 0) {
    node.dataset.v = String(value);
    node.textContent = fmtFull(value);
    return;
  }
  node.classList.remove('up', 'down');
  void node.offsetWidth;
  node.classList.add(value > from ? 'up' : 'down');
  const t0 = performance.now();
  const dur = 600;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    const v = Math.round(from + (value - from) * e);
    node.dataset.v = String(v);
    node.textContent = fmtFull(v);
    if (k < 1) node._raf = requestAnimationFrame(step);
  };
  node._raf = requestAnimationFrame(step);
}

export function renderPlayers() {
  const s = store.state;
  if (!s) return;
  s.players.forEach((p) => {
    const c = cardEls[p.id];
    if (!c) return;
    c.classList.toggle('active', s.status === 'playing' && s.current === p.id);
    c.classList.toggle('bankrupt', p.bankrupt);
    c.classList.toggle('winner', s.winner === p.id);
    c.classList.toggle('me', store.role !== 'local' && p.id === store.myId);
    c.classList.toggle('offline', p.type === 'remote' && p.online === false);
    c.querySelector('.pc-type').textContent = p.type === 'remote' && p.online === false ? '🔴 Mất kết nối' : typeLabel(p);
    animateMoney(c.querySelector('.pc-money'), p.money);
    const props = ownedBy(p.id);
    const cities = props.filter((i) => TILES[i].type === 'city').length;
    c.querySelector('.pc-props').textContent = `🏠 ${cities} · 🏖️ ${props.length - cities}`;
    c.querySelector('.pc-worth').textContent = `Tài sản ${fmt(netWorth(p))}`;
    const chips = [];
    if (p.bankrupt) chips.push('<span class="chip chip-bad">💀 Phá sản</span>');
    if (p.island > 0) chips.push(`<span class="chip" title="Đang kẹt trên Đảo Hoang">🏝️ ${p.island}</span>`);
    if (p.tour) chips.push('<span class="chip" title="Lượt sau được bay">✈️ Bay</span>');
    if (p.freeRent > 0) chips.push(`<span class="chip" title="Thẻ Miễn Thuê">🛡️ ${p.freeRent}</span>`);
    if (p.escape > 0) chips.push(`<span class="chip" title="Thuyền Cứu Hộ">🛶 ${p.escape}</span>`);
    const g = completedGroups(p.id);
    if (g > 0) chips.push(`<span class="chip chip-gold" title="Số nhóm màu độc quyền">🎨 ${g}/3</span>`);
    const rc = resortCount(p.id);
    if (rc >= 2) chips.push(`<span class="chip chip-sea" title="Khu nghỉ dưỡng">🏖️ ${rc}/4</span>`);
    c.querySelector('.pc-status').innerHTML = chips.join('');
  });
}

export function playerMoneyFx(pid, delta) {
  moneyFx(cardEls[pid], delta);
}

export function playerEmote(pid, emoji) {
  emoteFx(cardEls[pid], emoji);
}

export function renderPills() {
  const s = store.state;
  dom.roundPill.textContent = s ? `Vòng ${s.round}${s.maxRounds ? ` / ${s.maxRounds}` : ''}` : 'Vòng 1';
  const f = s && s.festival;
  dom.festPill.classList.toggle('hidden', !(f && f.tile != null));
  if (f && f.tile != null) dom.festPill.textContent = `🎉 ${TILES[f.tile].name} x${f.mult}`;
  const pct = s ? inflationPct() : 0;
  dom.inflPill.classList.toggle('hidden', pct <= 0);
  if (pct > 0) dom.inflPill.textContent = `📈 Lạm phát +${pct}%`;
  const room = s && s.online && s.online.code;
  dom.roomPill.classList.toggle('hidden', !room);
  if (room) dom.roomPill.textContent = `🌐 Phòng ${room}`;
}

// ---------- Dòng trạng thái & nút hành động ----------
export function setStatus(html) {
  if (dom.status) dom.status.innerHTML = html;
}

export function clearActions() {
  if (dom.actions) dom.actions.innerHTML = '';
  if (dom.hint) dom.hint.textContent = '';
}

/** Hiện nút hành động ở giữa bàn cờ và chờ người chơi bấm */
export function stageActions({ status, buttons, hint = '' }) {
  return humanWait((done) => {
    let end = () => {};
    const finish = (v) => {
      end();
      clearActions();
      done(v);
    };
    end = beginPrompt(finish);
    if (status != null) setStatus(status);
    dom.actions.innerHTML = '';
    dom.hint.textContent = hint;
    buttons.forEach((b) => {
      const btn = el('button', `btn btn-${b.style || 'ghost'}${b.big ? ' btn-big' : ''}`, b.label);
      btn.type = 'button';
      if (b.disabled) btn.disabled = true;
      if (b.hotkey) btn.dataset.hotkey = '1';
      btn.addEventListener('click', () => {
        Sound.unlock();
        Sound.play('click');
        finish(b.value);
      });
      dom.actions.appendChild(btn);
    });
  });
}

// ---------- Đồng hồ đếm giờ (chơi trực tuyến) ----------
let timerInt = null;
export function setTimer(pid, ms) {
  clearInterval(timerInt);
  timerInt = null;
  const s = store.state;
  if (pid == null || !ms || !s || !s.players[pid]) {
    dom.timer.textContent = '';
    dom.timer.classList.remove('urgent');
    return;
  }
  const p = s.players[pid];
  const end = Date.now() + ms;
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    const mine = store.role !== 'local' && pid === store.myId;
    dom.timer.innerHTML = `⏱️ ${left}s · ${mine ? 'Bạn đang quyết định' : `${esc(p.avatar)} ${esc(p.name)} đang quyết định`}`;
    dom.timer.classList.toggle('urgent', left <= 10);
    if (left <= 0) {
      clearInterval(timerInt);
      timerInt = null;
    }
  };
  tick();
  timerInt = setInterval(tick, 250);
}

// ---------- Nhật ký ----------
export function logItemHTML(e) {
  if (e.k === 'round') return `<li class="lg lg-round"><span>${e.h}</span></li>`;
  return `<li class="lg${e.k ? ` lg-${e.k}` : ''}"><span class="lg-r">V${e.r}</span><span class="lg-t">${e.h}</span></li>`;
}

export function renderLog() {
  const s = store.state;
  if (!dom.log) return;
  dom.log.innerHTML = s ? s.log.slice(0, 60).map(logItemHTML).join('') : '';
  dom.log.scrollTop = 0;
}
