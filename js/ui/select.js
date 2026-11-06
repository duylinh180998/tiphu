/**
 * Chế độ chọn ô trên bàn cờ (Lễ Hội, Chuyến Bay, nâng cấp…) và tooltip thông tin ô.
 */
import { humanWait } from '../core/session.js';
import { store } from '../core/store.js';
import { esc, fmtFull } from '../core/util.js';
import { LEVEL_ICONS, LEVEL_NAMES, RESORT_PRICE, RESORT_RENTS } from '../config.js';
import { TILES, GROUPS, GROUP_TILES, SPECIAL_DESC } from '../data/board.js';
import { rentOf, buyoutCost, sellValue, resortCount, inflationPct, hasMonopoly, isOutage } from '../game/rules.js';
import { dom } from './dom.js';
import { setSelectable, tileEl } from './board3d.js';
import { beginPrompt } from './prompt.js';
import { setStatus, clearActions } from './hud.js';
import { Sound } from './audio.js';

let selectHandler = null;
const hoverCapable = () => window.matchMedia && window.matchMedia('(hover: hover)').matches;

export function selectTile(cands, { title, cancelLabel = null }) {
  return humanWait((done) => {
    let end = () => {};
    const finish = (v) => {
      end();
      selectHandler = null;
      setSelectable(null);
      clearActions();
      setStatus('');
      done(v);
    };
    end = beginPrompt(finish);
    const set = new Set(cands);
    setSelectable(cands);
    setStatus(`<div class="select-title">${title}</div>`);
    dom.actions.innerHTML = '';
    dom.hint.textContent = '👆 Nhấn vào ô đang phát sáng trên bàn cờ';
    selectHandler = (i) => {
      if (!set.has(i)) return false;
      Sound.play('click');
      finish(i);
      return true;
    };
    if (cancelLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost';
      b.innerHTML = cancelLabel;
      b.addEventListener('click', () => {
        Sound.play('click');
        finish(null);
      });
      dom.actions.appendChild(b);
    }
  });
}

export function clearSelectMode() {
  selectHandler = null;
  setSelectable(null);
}

export function onTileClick(i) {
  if (selectHandler) {
    hideTooltip();
    if (selectHandler(i)) return;
  }
  if (dom.tooltip.classList.contains('show') && dom.tooltip.dataset.i === String(i) && !hoverCapable()) {
    hideTooltip();
    return;
  }
  showTooltip(i);
}

export function onTileEnter(i) {
  if (hoverCapable()) showTooltip(i);
}

export function onTileLeave() {
  if (hoverCapable()) hideTooltip();
}

// ---------- Tooltip ----------
export function groupDots(g) {
  return GROUP_TILES[g]
    .map((j) => {
      const o = store.state ? store.state.props[j].owner : null;
      const c = o != null ? store.state.players[o].color : 'transparent';
      return `<span class="gdot" style="--c:${c}" title="${esc(TILES[j].name)}"></span>`;
    })
    .join('');
}

function inflTag() {
  const pct = store.state ? inflationPct() : 0;
  return pct > 0 ? ` <span class="tt-infl">📈+${pct}%</span>` : '';
}

export function tileInfoHTML(i) {
  const t = TILES[i];
  const s = store.state;
  const pr = s ? s.props[i] : null;
  const owner = pr && pr.owner != null ? s.players[pr.owner] : null;
  if (t.type === 'city') {
    const g = GROUPS[t.group];
    const rows = [1, 2, 3, 4]
      .map((L) => `<tr class="${owner && pr.level === L ? 'cur' : ''}${L === 4 ? ' lm' : ''}"><td>${LEVEL_ICONS[L]} ${LEVEL_NAMES[L]}</td><td>${L === 1 ? fmtFull(t.eco.costs[1]) : `+${fmtFull(t.eco.costs[L])}`}</td><td>${fmtFull(t.eco.rents[L])}</td></tr>`)
      .join('');
    let status;
    if (owner) {
      const fest = (hasMonopoly(i) ? ' <span class="tt-fest">🎨x2</span>' : '') + (s.festival.tile === i ? ` <span class="tt-fest">🎉x${s.festival.mult}</span>` : '');
      status = `<div class="tt-owner" style="--pc:${owner.color}">${esc(owner.avatar)} ${esc(owner.name)} · ${LEVEL_ICONS[pr.level]} ${LEVEL_NAMES[pr.level]}</div>
        <div class="tt-line">💰 Tiền thuê hiện tại: <b>${fmtFull(rentOf(i))}</b>${fest}${inflTag()}</div>
        ${isOutage(i) ? `<div class="tt-line">🔌 Mất điện — không thu tiền thuê (còn ${pr.outage} vòng)</div>` : ''}
        <div class="tt-line">${pr.level >= 4 ? '🔒 Biểu Tượng — không thể bị mua đứt' : `💥 Giá mua đứt: <b>${fmtFull(buyoutCost(i))}</b>`}</div>
        <div class="tt-line">💱 Bán cho ngân hàng: ${fmtFull(sellValue(i))}</div>`;
    } else {
      status = `<div class="tt-line">🏷️ Chưa có chủ — giá từ <b>${fmtFull(t.eco.value[1])}</b></div>`;
    }
    return `<div class="tt-head" style="--g:${g.color}"><div class="tt-group">${esc(g.name)} <span class="gdots">${groupDots(t.group)}</span></div><div class="tt-name">${esc(t.name)}</div></div>
      ${status}
      <table class="tt-table"><thead><tr><th>Công trình</th><th>Chi phí</th><th>Thuê</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="tt-desc">🎨 Sở hữu trọn nhóm màu: tiền thuê cả nhóm x2.</div>`;
  }
  if (t.type === 'resort') {
    const cnt = owner ? resortCount(owner.id) : 0;
    const rows = [1, 2, 3, 4].map((n) => `<tr class="${owner && cnt === n ? 'cur' : ''}"><td>🏖️ Sở hữu ${n} khu</td><td>${n === 4 ? "🏆 Thắng ngay" : fmtFull(RESORT_RENTS[n])}</td></tr>`).join('');
    const status = owner
      ? `<div class="tt-owner" style="--pc:${owner.color}">${esc(owner.avatar)} ${esc(owner.name)} · ${cnt}/4 khu</div><div class="tt-line">💰 Tiền thuê hiện tại: <b>${fmtFull(rentOf(i))}</b>${inflTag()}</div><div class="tt-line">🔒 Khu nghỉ dưỡng không thể bị mua đứt</div><div class="tt-line">💱 Bán cho ngân hàng: ${fmtFull(sellValue(i))}</div>`
      : `<div class="tt-line">🏷️ Chưa có chủ — giá <b>${fmtFull(RESORT_PRICE)}</b></div>`;
    return `<div class="tt-head tt-resort"><div class="tt-group">Khu Nghỉ Dưỡng · không xây nhà</div><div class="tt-name">🏖️ ${esc(t.name)}</div></div>${status}<table class="tt-table"><thead><tr><th>Số khu</th><th>Thuê</th></tr></thead><tbody>${rows}</tbody></table><div class="tt-desc">Không xây nhà, không thể bị mua đứt. Sở hữu cả 4 khu = <b>Độc Quyền Du Lịch</b> (chiến thắng).</div>`;
  }
  let extra = '';
  if (t.type === 'festival' && s && s.festival.tile != null) {
    extra = `<div class="tt-line">Đang tổ chức tại <b>${esc(TILES[s.festival.tile].name)}</b> (x${s.festival.mult}) · đã tổ chức ${s.festival.editions} lần</div>`;
  }
  return `<div class="tt-head tt-special t-${t.type}"><div class="tt-name">${t.icon} ${esc(t.name)}</div></div><div class="tt-desc">${SPECIAL_DESC[t.type]}</div>${extra}`;
}

export function showTooltip(i) {
  const tip = dom.tooltip;
  const tile = tileEl(i);
  if (!tile) return;
  tip.innerHTML = tileInfoHTML(i);
  tip.dataset.i = String(i);
  tip.classList.add('show');
  const r = tile.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = r.left + r.width / 2;
  let x = cx - tw / 2;
  let y = r.top + r.height / 2 < H / 2 ? r.bottom + 10 : r.top - th - 10;
  if (y < 8 || y + th > H - 8) {
    x = cx < W / 2 ? r.right + 10 : r.left - tw - 10;
    y = r.top + r.height / 2 - th / 2;
  }
  tip.style.left = `${Math.max(8, Math.min(W - tw - 8, x))}px`;
  tip.style.top = `${Math.max(8, Math.min(H - th - 8, y))}px`;
}

export function hideTooltip() {
  if (dom.tooltip) dom.tooltip.classList.remove('show');
}
