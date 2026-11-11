/**
 * Hộp thoại: mua đất, nâng cấp, mua đứt, khu nghỉ dưỡng, thẻ Cơ Hội,
 * phá sản, thông tin người chơi, kết thúc ván, nhật ký, luật chơi.
 */
import { humanWait } from '../core/session.js';
import { store, S } from '../core/store.js';
import { esc, fmt, fmtFull, r5 } from '../core/util.js';
import { LEVEL_ICONS, LEVEL_NAMES, RESORT_PRICE, RESORT_RENTS, LANDMARK, BUYOUT_RATE } from '../config.js';
import { TILES, GROUPS, CARD_BY_ID } from '../data/board.js';
import {
  P, isBot, ownedBy, netWorth, completedGroups, resortCount, liquidation, rentOf, criticalTiles,
  inflationPct, hasMonopoly, isOutage, festMult, inflation,
} from '../game/rules.js';
import { buildingSprite } from './models.js';
import { pn } from '../game/text.js';
import { dom, el } from './dom.js';
import { beginPrompt } from './prompt.js';
import { groupDots } from './select.js';
import { logItemHTML } from './hud.js';
import { confetti } from './fx.js';
import { Sound } from './audio.js';
import { emitBus } from '../core/bus.js';

/** Hộp thoại chung. prompt: true → có thể bị đóng từ bên ngoài khi hết giờ. */
export function openModal({ icon = '', title = '', sub = '', html = '', buttons = [], cls = '', stack = false, auto = null, onMount = null, prompt = false }) {
  return humanWait((done) => {
    const bd = el('div', `modal-backdrop${auto ? ' passive' : ''}`);
    const card = el('div', `modal-card ${cls}`);
    const head = icon || title ? `<div class="modal-head">${icon ? `<div class="modal-icon">${icon}</div>` : ''}<div><div class="modal-title">${title}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ''}</div></div>` : '';
    card.innerHTML = `${head}<div class="modal-body">${html}</div>`;
    let closed = false;
    let end = () => {};
    const close = (v) => {
      if (closed) return;
      closed = true;
      end();
      bd.classList.add('closing');
      setTimeout(() => bd.remove(), 180);
      done(v);
    };
    if (prompt) end = beginPrompt(close);
    if (buttons.length) {
      const acts = el('div', `modal-actions${stack ? ' stack' : ''}`);
      buttons.forEach((b) => {
        const btn = el('button', `btn btn-${b.style || 'ghost'}`, b.label);
        btn.type = 'button';
        if (b.disabled) btn.disabled = true;
        if (b.hotkey) btn.dataset.hotkey = '1';
        btn.addEventListener('click', () => {
          Sound.unlock();
          Sound.play('click');
          close(b.value);
        });
        acts.appendChild(btn);
      });
      card.appendChild(acts);
    }
    bd.appendChild(card);
    dom.modalRoot.appendChild(bd);
    if (onMount) onMount(card, close);
    if (auto) setTimeout(() => close(auto.value), auto.ms);
  });
}

export const closeAllModals = () => {
  if (dom.modalRoot) dom.modalRoot.innerHTML = '';
};

// ---------- Thẻ chủ quyền ----------
export function deedHTML(i) {
  const t = TILES[i];
  const g = GROUPS[t.group];
  const pr = store.state.props[i];
  const owned = pr.owner != null;
  const rows = [1, 2, 3, 4, 5]
    .map((L) => `<tr class="${owned && pr.level === L ? 'cur' : ''}${L === LANDMARK ? ' lm' : ''}"><td>${LEVEL_ICONS[L]} ${LEVEL_NAMES[L]}</td><td>${L === 1 ? fmtFull(t.eco.costs[1]) : `+${fmtFull(t.eco.costs[L])}`}</td><td><b>${fmtFull(t.eco.rents[L])}</b></td></tr>`)
    .join('');
  let notes = store.state.festival.tile === i
    ? `<div class="deed-note">🎉 Đang tổ chức Lễ Hội — tiền thuê x${store.state.festival.mult}</div>`
    : festMult(i) > 1 ? '<div class="deed-note">🎊 Lễ Hội Đường Phố — tiền thuê x2</div>' : '';
  if (hasMonopoly(i)) notes += '<div class="deed-note deed-mono">🎨 Chủ sở hữu trọn nhóm màu — tiền thuê x2</div>';
  else notes += '<div class="deed-note deed-tip">🎨 Sở hữu trọn nhóm màu: tiền thuê cả nhóm x2</div>';
  if (isOutage(i)) notes += `<div class="deed-note deed-infl">🔌 Đang mất điện — không thu tiền thuê (còn ${pr.outage} vòng)</div>`;
  const pct = inflationPct();
  if (pct > 0) notes += `<div class="deed-note deed-infl">📈 Lạm phát: tiền thuê thực tế +${pct}% so với bảng</div>`;
  return `<div class="deed" style="--g:${g.color}">
    <div class="deed-head"><div class="deed-group">${esc(g.name)} <span class="gdots">${groupDots(t.group)}</span></div><div class="deed-name">${esc(t.name)}</div></div>
    <table class="deed-table"><thead><tr><th>Công trình</th><th>Chi phí</th><th>Tiền thuê</th></tr></thead><tbody>${rows}</tbody></table>
    ${notes}
  </div>`;
}

export function resortDeedHTML(i) {
  const pr = store.state.props[i];
  const cnt = pr.owner != null ? resortCount(pr.owner) : 0;
  const rows = [1, 2, 3, 4].map((n) => `<tr class="${pr.owner != null && cnt === n ? 'cur' : ''}"><td>🏖️ Sở hữu ${n} khu</td><td><b>${n === 4 ? "🏆 Thắng ngay" : fmtFull(RESORT_RENTS[n])}</b></td></tr>`).join('');
  return `<div class="deed deed-resort">
    <div class="deed-head"><div class="deed-group">Khu Nghỉ Dưỡng</div><div class="deed-name">🏖️ ${esc(TILES[i].name)}</div></div>
    <table class="deed-table"><thead><tr><th>Số khu cùng chủ</th><th>Tiền thuê</th></tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}

const winNote = (p, i) => (criticalTiles(p.id).has(i) ? '<div class="win-note">🏆 Sở hữu ô này bạn sẽ <b>CHIẾN THẮNG</b> ngay lập tức!</div>' : '');

// ---------- Hộp thoại quyết định ----------

/** Hình minh họa một cấp công trình: khu đất hình thoi và công trình (màu người chơi) */
function levelArt(level, color) {
  const lot = '<svg class="bp-lot" viewBox="0 0 120 70" aria-hidden="true"><polygon points="60,4 116,32 60,60 4,32" class="bp-lot-top"/><polygon points="4,32 60,60 60,68 4,40" class="bp-lot-l"/><polygon points="60,60 116,32 116,40 60,68" class="bp-lot-r"/></svg>';
  return `<div class="bp-art">${lot}<div class="bp-bld">${buildingSprite(level, color)}</div></div>`;
}

/**
 * Bảng chọn công trình dạng thẻ (dùng cho mua đất và nâng cấp):
 * 5 thẻ Đất nền → Biểu Tượng; cấp đã có đóng dấu "ĐÃ XÂY", cấp chưa mở khóa có ổ khóa.
 * Nhấn thẻ để chọn xây tới cấp đó (các cấp thấp hơn tự được chọn theo). Trả về cấp đã chọn hoặc 0.
 */
function buildPicker(p, i, { options, locked = [], mode, title }) {
  const t = TILES[i];
  const g = GROUPS[t.group];
  const cur = store.state.props[i].owner === p.id ? store.state.props[i].level : 0;
  const optBy = new Map(options.map((o) => [o.level, o]));
  const lockBy = new Map(locked.map((o) => [o.level, o]));
  const affordable = options.filter((o) => o.cost <= p.money);
  let sel = affordable.length ? affordable[affordable.length - 1].level : 0;
  const minOpt = options.length ? options[0].level : 0;
  const mult = festMult(i) * inflation();
  return humanWait((done) => {
    const bd = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card bp-card');
    card.style.setProperty('--g', g.color);
    bd.appendChild(card);
    dom.modalRoot.appendChild(bd);
    let end = () => {};
    const finish = (v) => {
      end();
      bd.classList.add('closing');
      setTimeout(() => bd.remove(), 180);
      done(v);
    };
    end = beginPrompt(finish);
    const lockText = (L) => {
      if (L === LANDMARK) return cur >= 4 ? '' : 'Cần Khách sạn';
      const lk = lockBy.get(L);
      return lk ? `Mở ở vòng ${lk.lap}` : 'Chưa mở';
    };
    const render = () => {
      const o = optBy.get(sel);
      const cost = o ? o.cost : 0;
      const rent = o ? r5(o.rent * mult) : 0;
      const resale = o && sel < LANDMARK ? t.eco.value[sel] * BUYOUT_RATE : 0;
      const cards = [1, 2, 3, 4, 5].map((L) => {
        let state;
        let note = '';
        if (L <= cur) {
          state = 'have';
        } else if (optBy.has(L)) {
          const oo = optBy.get(L);
          state = L <= sel ? 'on' : 'off';
          if (oo.cost > p.money) {
            state += ' poor';
            note = '<span class="bp-note">Không đủ tiền</span>';
          } else {
            note = `<span class="bp-note">thuê ${fmt(oo.rent)}</span>`;
          }
        } else {
          state = 'lock';
          note = `<span class="bp-note">🔒 ${lockText(L)}</span>`;
        }
        const stamp = state === 'have' ? '<span class="bp-stamp">ĐÃ XÂY</span>' : '';
        const check = state.startsWith('on') || state === 'have' ? '✔' : '';
        return `<button type="button" class="bp-lv ${state}${L === LANDMARK ? ' lm' : ''}" data-lv="${L}" ${state.startsWith('on') || state.startsWith('off') ? '' : 'tabindex="-1"'}>
          ${stamp}${levelArt(L, p.color)}
          <span class="bp-name">${LEVEL_NAMES[L]}</span>${note}
          <span class="bp-check">${check}</span>
        </button>`;
      }).join('');
      const fest = festMult(i) > 1 ? ` <span class="bp-tag">🎉 x${festMult(i)}</span>` : '';
      const label = mode === 'buy' ? 'MUA' : 'XÂY';
      card.innerHTML = `
        <div class="bp-head"><div class="bp-title"><span class="bp-group">${esc(g.name)}</span>${esc(t.name)}</div><button type="button" class="bp-x" data-skip aria-label="Bỏ qua">✕</button></div>
        <div class="bp-sub">${title ? `${esc(title)} · ` : ''}Tiền mặt: <b>${fmtFull(p.money)}</b>${p.coupon > 0 ? ' · 🏷️ đã giảm 50%' : ''}</div>
        <div class="modal-body"><div class="bp-row">${cards}</div>${winNote(p, i)}</div>
        <div class="bp-foot">
          <div class="bp-rent">Tiền thuê: <b>${o ? fmtFull(rent) : '—'}</b>${fest}</div>
          <button type="button" class="btn bp-buy" data-buy data-hotkey="1" ${o && cost <= p.money ? '' : 'disabled'}>${o ? `${label} VỚI GIÁ ${fmtFull(cost)}` : 'Chọn công trình'}</button>
          <div class="bp-resale">${o ? (sel >= LANDMARK ? '🔒 Biểu Tượng: không ai mua lại được' : `Người khác có thể mua lại với giá: <b>${fmtFull(resale)}</b>`) : ''}</div>
          <button type="button" class="bp-skip" data-skip>${mode === 'buy' ? 'Bỏ qua, không mua' : 'Để sau'}</button>
        </div>`;
      card.querySelectorAll('.bp-lv.on, .bp-lv.off').forEach((b) => b.addEventListener('click', () => {
        const L = Number(b.dataset.lv);
        if (optBy.get(L).cost > p.money) return;
        sel = L === sel && L > minOpt ? L - 1 : L;
        Sound.play('click');
        render();
      }));
      card.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
        Sound.play('click');
        finish(0);
      }));
      card.querySelector('[data-buy]').addEventListener('click', () => {
        if (!o || cost > p.money) return;
        Sound.unlock();
        Sound.play('click');
        finish(sel);
      });
    };
    render();
  });
}

export function purchaseDialog(p, i, options, locked = []) {
  return buildPicker(p, i, { options, locked, mode: 'buy', title: 'Mua đất' });
}

export function upgradeDialog(p, i, options, title) {
  return buildPicker(p, i, { options, mode: 'upgrade', title });
}

/** Mua đứt thành phố của người khác: cùng dạng thẻ như bảng mua đất, các cấp đã xây mang màu của chủ hiện tại */
export function buyoutDialog(p, i, cost) {
  const t = TILES[i];
  const g = GROUPS[t.group];
  const pr = store.state.props[i];
  const owner = P(pr.owner);
  const canPay = cost <= p.money;
  const rent = r5(t.eco.rents[pr.level] * festMult(i) * inflation());
  const cards = [1, 2, 3, 4, 5].map((L) => {
    const have = L <= pr.level;
    const note = have ? '' : `<span class="bp-note">${L === pr.level + 1 ? 'Xây thêm sau khi mua' : '&nbsp;'}</span>`;
    return `<div class="bp-lv ${have ? 'on buy' : 'lock'}${L === LANDMARK ? ' lm' : ''}" data-lv="${L}">
      ${levelArt(L, have ? owner.color : p.color)}
      <span class="bp-name">${LEVEL_NAMES[L]}</span>${note}
      <span class="bp-check">${have ? '✔' : ''}</span>
    </div>`;
  }).join('');
  const fest = festMult(i) > 1 ? ` <span class="bp-tag">🎉 x${festMult(i)}</span>` : '';
  return humanWait((done) => {
    const bd = el('div', 'modal-backdrop');
    const card = el('div', 'modal-card bp-card');
    card.style.setProperty('--g', g.color);
    bd.appendChild(card);
    dom.modalRoot.appendChild(bd);
    let end = () => {};
    const finish = (v) => {
      end();
      bd.classList.add('closing');
      setTimeout(() => bd.remove(), 180);
      done(v);
    };
    end = beginPrompt(finish);
    card.innerHTML = `
      <div class="bp-head"><div class="bp-title"><span class="bp-group">${esc(g.name)}</span>${esc(t.name)}</div><button type="button" class="bp-x" data-skip aria-label="Thôi">✕</button></div>
      <div class="bp-sub">💥 Mua đứt từ ${pn(owner)} · Tiền mặt: <b>${fmtFull(p.money)}</b>${p.coupon > 0 ? ' · 🏷️ đã giảm 50%' : ''}</div>
      <div class="modal-body"><div class="bp-row">${cards}</div>${winNote(p, i)}</div>
      <div class="bp-foot">
        <div class="bp-rent">Tiền thuê: <b>${fmtFull(rent)}</b>${fest}</div>
        <button type="button" class="btn bp-buy bp-buyout" data-buy data-hotkey="1" ${canPay ? '' : 'disabled'}>MUA ĐỨT VỚI GIÁ ${fmtFull(cost)}</button>
        <div class="bp-resale">Trả gấp đôi giá trị hiện tại cho ${pn(owner)}. Mua xong được nâng cấp tiếp ngay${pr.level === 4 ? ' (lên thẳng Biểu Tượng)' : ''}.</div>
        <button type="button" class="bp-skip" data-skip>Thôi, không mua</button>
      </div>`;
    card.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
      Sound.play('click');
      finish(false);
    }));
    card.querySelector('[data-buy]').addEventListener('click', () => {
      if (!canPay) return;
      Sound.unlock();
      Sound.play('click');
      finish(true);
    });
  });
}

export function resortDialog(p, i) {
  return openModal({
    prompt: true,
    icon: '🏖️',
    title: `Mua Khu Nghỉ Dưỡng ${esc(TILES[i].name)}?`,
    sub: `Bạn đang có ${resortCount(p.id)}/4 khu · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
    html: `${resortDeedHTML(i)}${winNote(p, i)}<p class="hint">Khu nghỉ dưỡng không xây nhà được. Tiền thuê tăng theo số khu cùng chủ.</p>`,
    buttons: [
      { label: 'Bỏ qua', value: false, style: 'ghost' },
      { label: `🏖️ Mua ${fmtFull(RESORT_PRICE)}`, value: true, style: 'primary' },
    ],
  });
}

/** Thẻ Cơ Hội: ack = người rút bấm OK; ngược lại tự đóng sau một lúc */
export function chanceDialog(p, cardId, { ack = false } = {}) {
  const card = CARD_BY_ID[cardId];
  if (!card) return Promise.resolve(true);
  const html = `<div class="chance-card ${card.good ? 'good' : 'bad'}"><div class="cc-icon">${card.icon}</div><div class="cc-title">${esc(card.title)}</div><div class="cc-text">${esc(card.text)}</div></div>`;
  if (!ack) return openModal({ title: `🎁 ${esc(p.name)} rút thẻ Cơ Hội`, html, cls: 'modal-chance', auto: { ms: S().card, value: true } });
  return openModal({
    prompt: true,
    title: '🎁 Thẻ Cơ Hội',
    html,
    cls: 'modal-chance',
    buttons: [{ label: 'OK, tiếp tục', value: true, style: 'primary', hotkey: true }],
  });
}

export function bankruptDialog(p, d) {
  const to = d.to != null ? P(d.to) : null;
  return openModal({
    prompt: true,
    icon: '💀',
    title: `${esc(p.name)} không thể trả nợ!`,
    html: `<p>Cần trả <b>${fmtFull(d.amount)}</b> nhưng toàn bộ tiền mặt cộng tài sản bán được chỉ có <b>${fmtFull(d.total)}</b>.</p><p>Toàn bộ tài sản sẽ bị thanh lý${to ? ` và chuyển cho ${pn(to)}` : ''}.</p>`,
    buttons: [{ label: '💀 Chấp nhận phá sản', value: true, style: 'danger', hotkey: true }],
  });
}

/** Thông báo cho người vừa phá sản trên máy này (không chặn ván đấu) */
export function bankruptNotice(allowNew) {
  return openModal({
    icon: '💀',
    title: 'Bạn đã phá sản!',
    html: '<p>Bạn có thể tiếp tục xem ván đấu để tìm ra nhà vô địch.</p>',
    buttons: [
      ...(allowNew ? [{ label: '🆕 Ván mới', value: 'new', style: 'ghost' }] : []),
      { label: '👀 Xem tiếp', value: 'watch', style: 'primary', hotkey: true },
    ],
  }).then((v) => {
    if (v === 'new') emitBus('app:menu');
  }, () => {});
}

export function confirmDialog({ icon = '❓', title, html, yes = 'Đồng ý', no = 'Hủy', danger = false }) {
  return openModal({
    icon,
    title,
    html,
    buttons: [
      { label: no, value: false, style: 'ghost' },
      { label: yes, value: true, style: danger ? 'danger' : 'primary', hotkey: true },
    ],
  }).catch(() => false);
}

// ---------- Thông tin ----------
export function showPlayerInfo(pid) {
  const s = store.state;
  if (!s || !s.players[pid]) return;
  const p = P(pid);
  const rows = ownedBy(pid)
    .map((i) => {
      const t = TILES[i];
      const pr = s.props[i];
      const color = t.type === 'city' ? GROUPS[t.group].color : '#0ea5e9';
      return `<div class="pi-row" style="--g:${color}"><span class="sell-band"></span><span class="pi-name">${esc(t.name)}</span><span class="pi-lvl">${t.type === 'city' ? LEVEL_ICONS[pr.level] : '🏖️'}</span><span class="pi-rent">thuê ${fmt(rentOf(i))}</span></div>`;
    })
    .join('');
  const cards = [];
  if (p.parity) cards.push(`🎯 Chẵn/Lẻ còn ${p.parity} lần`);
  if (p.coupon) cards.push(`🏷️ Giảm Giá 50% x${p.coupon}`);
  if (p.escape) cards.push(`🛶 Thoát Đảo Hoang x${p.escape}`);
  const type = isBot(p) ? '🤖 Máy' : p.type === 'remote' ? '🌐 Trực tuyến' : '👤 Người chơi';
  openModal({
    icon: esc(p.avatar),
    title: esc(p.name),
    sub: `${type} · Tiền mặt ${fmtFull(p.money)} · Tổng tài sản ${fmtFull(netWorth(p))}`,
    html: `<div class="pi-stats"><span>🎨 Nhóm màu độc quyền: <b>${completedGroups(pid)}/3</b></span><span>🏖️ Khu nghỉ dưỡng: <b>${resortCount(pid)}/4</b></span><span>💱 Bán hết được: <b>${fmtFull(liquidation(p))}</b></span>${cards.length ? `<span>${cards.join(' · ')}</span>` : ''}</div><div class="pi-list">${rows || '<p class="hint">Chưa sở hữu tài sản nào.</p>'}</div>`,
    buttons: [{ label: 'Đóng', value: true, style: 'ghost', hotkey: true }],
  }).catch(() => {});
}

function standingsHTML() {
  const s = store.state;
  const winner = s.winner;
  const list = [...s.players].sort((a, b) => {
    if (a.id === winner) return -1;
    if (b.id === winner) return 1;
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    if (!a.bankrupt) return netWorth(b) - netWorth(a);
    return s.out.indexOf(b.id) - s.out.indexOf(a.id);
  });
  return `<ol class="standings">${list
    .map((p, k) => `<li class="${p.id === winner ? 'win' : ''}" style="--pc:${p.color}"><span class="st-rank">${['🥇', '🥈', '🥉'][k] || k + 1}</span><span class="st-av">${esc(p.avatar)}</span><span class="st-name">${esc(p.name)}</span><span class="st-val">${p.bankrupt ? `💀 Phá sản (vòng ${p.outRound})` : fmtFull(netWorth(p))}</span></li>`)
    .join('')}</ol>`;
}

export function gameOverDialog(fresh) {
  const s = store.state;
  if (!s || s.winner == null) return;
  const w = P(s.winner);
  const r = s.winReason || { icon: '🏆', label: 'Chiến thắng', desc: '' };
  if (fresh) confetti();
  const mine = store.role !== 'local' && w.id === store.myId;
  openModal({
    icon: '🏆',
    title: mine ? 'BẠN ĐÃ CHIẾN THẮNG!' : `${esc(w.name)} CHIẾN THẮNG!`,
    sub: `${esc(r.icon)} ${esc(r.label)} — ${esc(r.desc)} · ${s.round} vòng`,
    cls: 'modal-win',
    html: `<div class="win-hero" style="--pc:${w.color}"><div class="win-av">${esc(w.avatar)}</div></div>${standingsHTML()}`,
    buttons: [
      { label: '👀 Xem bàn cờ', value: 'view', style: 'ghost' },
      { label: store.role === 'guest' ? '🚪 Về menu' : '🔄 Ván mới', value: 'new', style: 'primary', hotkey: true },
    ],
  }).then((v) => {
    if (v === 'new') emitBus('app:menu');
  }, () => {});
}

export function logModal() {
  const s = store.state;
  if (!s) return;
  openModal({ icon: '📜', title: 'Nhật ký ván đấu', cls: 'wide', html: `<ol class="log-list log-modal">${s.log.map(logItemHTML).join('')}</ol>`, buttons: [{ label: 'Đóng', value: true, style: 'ghost', hotkey: true }] }).catch(() => {});
}

const RULES_HTML = `
  <div class="rules">
    <h4>🎯 5 cách chiến thắng</h4>
    <ul>
      <li>🏆 <b>Người trụ lại cuối cùng</b> — mọi đối thủ đều phá sản.</li>
      <li>🎨 <b>Độc quyền 3 màu</b> — sở hữu trọn vẹn 3 nhóm màu thành phố bất kỳ.</li>
      <li>🛣️ <b>Độc quyền 1 cạnh</b> — sở hữu toàn bộ thành phố và khu nghỉ dưỡng trên cùng 1 cạnh bàn cờ.</li>
      <li>🏖️ <b>Độc quyền du lịch</b> — sở hữu cả 4 Khu Nghỉ Dưỡng.</li>
      <li>⏱️ <b>Hết 30 vòng</b> — người có tổng tài sản (tiền mặt + giá trị bất động sản) lớn nhất thắng.</li>
    </ul>
    <h4>🎲 Lượt chơi</h4>
    <ul>
      <li>Lắc 2 xúc xắc rồi đi theo chiều kim đồng hồ. Đổ <b>đôi</b> được lắc thêm lượt; đôi <b>3 lần liên tiếp</b> → đưa thẳng ra Đảo Hoang.</li>
      <li>🎯 <b>Chẵn/Lẻ</b>: mỗi người có 3 lần chọn trước khi lắc để tổng xúc xắc chắc chắn là số chẵn hoặc số lẻ.</li>
    </ul>
    <h4>🏙️ Thành phố — 5 cấp công trình</h4>
    <ul>
      <li>🚩 Đất nền → 🏠 Nhà cấp 1 → 🏘️ Nhà cấp 2 → 🏨 Khách sạn → 🗼 <b>Biểu Tượng</b>.</li>
      <li>🔒 Mở khóa theo số lần đi qua Bắt Đầu: <b>vòng 1</b> chỉ mua được Đất nền; <b>vòng 2</b> xây tới Nhà cấp 2; <b>từ vòng 3</b> mới xây được Khách sạn (mua đất trống có thể xây một mạch lên Khách sạn).</li>
      <li>Biểu Tượng: thành phố phải là Khách sạn, rồi <b>dừng lại ô đó lần nữa</b>, <b>dừng ở ô Bắt Đầu</b>, hoặc <b>mua đứt</b> một Khách sạn rồi nâng ngay.</li>
      <li>🎨 Sở hữu trọn nhóm màu: tiền thuê của cả nhóm <b>x2</b> (cộng dồn với Lễ Hội).</li>
    </ul>
    <h4>💥 Mua đứt</h4>
    <ul>
      <li>Dừng ở thành phố đối thủ: trả tiền thuê, sau đó được quyền trả <b>gấp đôi giá trị hiện tại</b> để mua đứt rồi nâng cấp tiếp.</li>
      <li>Biểu Tượng và khu nghỉ dưỡng <b>không thể</b> bị mua đứt.</li>
    </ul>
    <h4>⭐ Ô đặc biệt</h4>
    <ul>
      <li>🏁 <b>Bắt Đầu</b>: đi qua nhận $300K; dừng đúng ô được nâng 1 thành phố thêm 1 cấp (kể cả lên Biểu Tượng).</li>
      <li>🏝️ <b>Đảo Hoang</b>: kẹt 3 lượt. Thoát bằng đổ đôi (đi luôn, không thêm lượt) hoặc trả $200K; thẻ Thoát Đảo tự dùng. Hết 3 lượt thì lượt sau tự đi.</li>
      <li>🎉 <b>Lễ Hội Thế Giới</b>: chọn 1 thành phố của mình, tiền thuê x2, các lần sau x3, x4, x5. Mỗi lúc chỉ 1 thành phố tổ chức.</li>
      <li>🎊 <b>Lễ Hội Đường Phố</b>: khi bắt đầu ván có <b>2 thành phố ngẫu nhiên</b> tổ chức lễ hội (tiền thuê <b>x2</b>); cứ sau <b>5 vòng</b> lại thêm 1 thành phố. Lễ hội kéo dài tới khi bị thẻ 🚫 Dẹp Lễ Hội xóa.</li>
      <li>✈️ <b>Chuyến Bay Thế Giới</b>: lượt sau trả $50K để bay tới bất kỳ ô nào, kể cả thành phố người khác đã mua (trả tiền thuê, rồi được mua đứt nếu đủ tiền).</li>
      <li>🏖️ <b>Khu Nghỉ Dưỡng</b> (4 ô): thuê $50K / $100K / $200K theo số khu sở hữu; đủ 4 khu là thắng.</li>
      <li>💸 <b>Thuế</b>: nộp 1% tổng tài sản (tiền mặt + bất động sản).</li>
    </ul>
    <h4>🎁 Thẻ Cơ Hội</h4>
    <ul>
      <li>🌋 Động Đất (phá 1 cấp công trình của đối thủ) · 🔌 Mất Điện (1 thành phố không thu thuê 3 vòng) · 🚫 Dẹp Lễ Hội (xóa lễ hội của 1 thành phố) · 📜 Cưỡng Chế Bán.</li>
      <li>🏷️ Giảm Giá 50% · 🛶 Thoát Đảo Hoang · 🎉 Vé Lễ Hội · 🎫 Vé Máy Bay · 🏁 Về Bắt Đầu · 🌊 Đắm Tàu.</li>
    </ul>
    <h4>🆘 Phá sản</h4>
    <ul>
      <li>Không đủ tiền trả nợ: buộc bán bớt tài sản cho ngân hàng (nhận lại 50% số tiền đã đầu tư) cho tới khi đủ.</li>
      <li>Bán hết vẫn không đủ → <b>phá sản</b>, toàn bộ tiền còn lại thuộc về chủ nợ.</li>
      <li>📈 Ván không giới hạn vòng: từ vòng 41 tiền thuê tăng thêm 5% mỗi vòng.</li>
    </ul>
    <h4>🌐 Chơi trực tuyến</h4>
    <ul>
      <li>Chủ phòng tạo phòng và gửi mã / đường link cho bạn bè (tối đa 4 người, ghế trống có thể để máy chơi).</li>
      <li>Mỗi quyết định có <b>45 giây</b>; hết giờ hệ thống tự chọn phương án an toàn.</li>
      <li>Người mất kết nối được chờ 20 giây, sau đó máy chơi thay cho tới khi họ vào lại.</li>
    </ul>
  </div>`;

export function rulesModal() {
  openModal({ icon: '📖', title: 'Luật chơi', cls: 'wide', html: RULES_HTML, buttons: [{ label: 'Đã hiểu!', value: true, style: 'primary', hotkey: true }] }).catch(() => {});
}
