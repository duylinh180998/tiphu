/**
 * Hộp thoại: mua đất, nâng cấp, mua đứt, khu nghỉ dưỡng, thẻ Cơ Hội,
 * phá sản, thông tin người chơi, kết thúc ván, nhật ký, luật chơi.
 */
import { humanWait } from '../core/session.js';
import { store, S } from '../core/store.js';
import { esc, fmt, fmtFull } from '../core/util.js';
import { LEVEL_ICONS, LEVEL_NAMES, RESORT_PRICE, RESORT_RENTS, LANDMARK } from '../config.js';
import { TILES, GROUPS, CARD_BY_ID } from '../data/board.js';
import {
  P, isBot, ownedBy, netWorth, completedGroups, resortCount, liquidation, rentOf, criticalTiles,
  inflationPct, hasMonopoly, isOutage,
} from '../game/rules.js';
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
    : store.state.street && store.state.street.tile === i ? `<div class="deed-note">🎊 Lễ Hội Đường Phố — tiền thuê x2 (còn ${store.state.street.left} vòng)</div>` : '';
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
export function purchaseDialog(p, i, options, locked = []) {
  const t = TILES[i];
  return openModal({
    prompt: true,
    icon: '🏗️',
    title: `Mua đất ${esc(t.name)}`,
    sub: `${esc(GROUPS[t.group].name)} · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
    html: `${deedHTML(i)}${winNote(p, i)}${locked.length ? `<div class="locked-row">${locked.map((o) => `<span class="lock-chip">🔒 ${LEVEL_ICONS[o.level]} ${LEVEL_NAMES[o.level]} · vòng ${o.lap}</span>`).join('')}</div>` : ''}<p class="hint">Biểu Tượng 🗼: cần có Khách sạn rồi dừng lại đây, dừng ở ô Bắt Đầu hoặc mua đứt.</p>${p.coupon > 0 ? '<p class="hint">🏷️ Giá đã giảm 50% nhờ thẻ Giảm Giá.</p>' : ''}`,
    stack: true,
    buttons: [
      ...options.map((o, k) => ({
        label: `<span>${LEVEL_ICONS[o.level]} Mua kèm ${LEVEL_NAMES[o.level]}</span><span class="btn-meta">${fmtFull(o.cost)} · thuê ${fmt(o.rent)}</span>`,
        value: o.level,
        style: k === 0 ? 'blue' : k === 1 ? 'green' : 'primary',
        disabled: o.cost > p.money,
      })),
      { label: 'Bỏ qua', value: 0, style: 'ghost' },
    ],
  });
}

export function upgradeDialog(p, i, options, title) {
  const t = TILES[i];
  const lm = options.some((o) => o.level === LANDMARK);
  return openModal({
    prompt: true,
    icon: lm ? '🗼' : '🔨',
    title: `${esc(title)}: ${esc(t.name)}`,
    sub: `Hiện tại: ${LEVEL_ICONS[store.state.props[i].level]} ${LEVEL_NAMES[store.state.props[i].level]} · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
    html: `${deedHTML(i)}${lm ? '<p class="hint">🗼 Biểu Tượng tăng mạnh tiền thuê và <b>không thể bị mua đứt</b>.</p>' : ''}`,
    stack: true,
    buttons: [
      ...options.map((o) => ({
        label: `<span>${LEVEL_ICONS[o.level]} Lên ${LEVEL_NAMES[o.level]}</span><span class="btn-meta">${fmtFull(o.cost)} · thuê ${fmt(o.rent)}</span>`,
        value: o.level,
        style: o.level === LANDMARK ? 'gold' : 'green',
        disabled: o.cost > p.money,
      })),
      { label: 'Để sau', value: 0, style: 'ghost' },
    ],
  });
}

export function buyoutDialog(p, i, cost) {
  const t = TILES[i];
  const owner = P(store.state.props[i].owner);
  return openModal({
    prompt: true,
    icon: '💥',
    title: `Mua đứt ${esc(t.name)}?`,
    sub: `Chủ hiện tại: ${pn(owner)} · Tiền mặt của bạn: <b>${fmtFull(p.money)}</b>`,
    html: `${deedHTML(i)}${winNote(p, i)}<p>Trả gấp đôi giá trị hiện tại (<b>${fmtFull(cost)}</b>${p.coupon > 0 ? ', đã giảm 50%' : ''}) cho ${pn(owner)} để sở hữu ngay thành phố này.</p><p class="hint">Sau khi mua đứt bạn được nâng cấp tiếp ngay; nếu đang là Khách sạn thì lên thẳng được Biểu Tượng.</p>`,
    buttons: [
      { label: 'Thôi', value: false, style: 'ghost' },
      { label: `💥 Mua đứt ${fmtFull(cost)}`, value: true, style: 'primary' },
    ],
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
      <li>🎊 <b>Lễ Hội Đường Phố</b> (ngẫu nhiên): từ một vòng ngẫu nhiên đầu ván, 1 thành phố được tổ chức lễ hội, tiền thuê <b>x2</b> trong <b>2 vòng</b>, sau đó lễ hội chuyển sang thành phố khác.</li>
      <li>✈️ <b>Chuyến Bay Thế Giới</b>: lượt sau trả $50K để bay tới bất kỳ ô nào.</li>
      <li>🏖️ <b>Khu Nghỉ Dưỡng</b> (4 ô): thuê $50K / $100K / $200K theo số khu sở hữu; đủ 4 khu là thắng.</li>
      <li>💸 <b>Thuế</b>: nộp 10% tổng tài sản (tiền mặt + bất động sản).</li>
    </ul>
    <h4>🎁 Thẻ Cơ Hội</h4>
    <ul>
      <li>🌋 Động Đất (phá 1 cấp công trình của đối thủ) · 🔌 Mất Điện (1 thành phố không thu thuê 3 vòng) · 📜 Cưỡng Chế Bán.</li>
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
