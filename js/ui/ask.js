/**
 * Hiển thị giao diện cho một yêu cầu quyết định của người chơi trên máy này.
 * Dùng chung cho chơi một máy, chủ phòng và máy khách trực tuyến.
 */
import { esc, fmt } from '../core/util.js';
import { ISLAND_FEE } from '../config.js';
import { store } from '../core/store.js';
import { pn } from '../game/text.js';
import { stageActions } from './hud.js';
import { selectTile } from './select.js';
import {
  purchaseDialog, upgradeDialog, buyoutDialog, resortDialog, shieldDialog, chanceDialog, sellDialog, bankruptDialog,
} from './dialogs.js';

function rollStatus(p, d) {
  const humans = store.state.players.filter((q) => q.type === 'human').length;
  const who = store.role === 'local' && humans <= 1 ? `<b>${esc(p.name)}</b>, đến lượt bạn!` : `Lượt của ${pn(p)}!`;
  return `<span class="who">${esc(p.avatar)}</span> ${who}${d.bonus ? ' <span class="dbl-tag">THÊM LƯỢT</span>' : ''}`;
}

export function localAsk(p, kind, d) {
  switch (kind) {
    case 'roll':
      return stageActions({
        status: rollStatus(p, d),
        buttons: [{ label: '🎲 LẮC XÚC XẮC', value: 'roll', style: 'primary', big: true, hotkey: true }],
        hint: 'Phím tắt: Space / Enter',
      });
    case 'island': {
      const buttons = [{ label: '🎲 Đổ tìm đôi', value: 'roll', style: 'primary', hotkey: true }];
      buttons.push({ label: `💵 Trả ${fmt(ISLAND_FEE)} rời đảo`, value: 'pay', style: 'gold', disabled: !d.canPay });
      if (d.escape > 0) buttons.push({ label: `🛶 Dùng Thuyền Cứu Hộ (${d.escape})`, value: 'card', style: 'blue' });
      return stageActions({ status: `🏝️ ${pn(p)} đang kẹt trên Đảo Hoang — còn <b>${d.turns}</b> lượt`, buttons });
    }
    case 'tour':
    case 'select':
      return selectTile(d.cands, { title: d.title, cancelLabel: d.cancelLabel || null });
    case 'purchase':
      return purchaseDialog(p, d.i, d.options);
    case 'upgrade':
      return upgradeDialog(p, d.i, d.options, d.title);
    case 'buyout':
      return buyoutDialog(p, d.i, d.cost);
    case 'resort':
      return resortDialog(p, d.i);
    case 'shield':
      return shieldDialog(p, d);
    case 'card':
      return chanceDialog(p, d.id, { ack: true });
    case 'sell':
      return sellDialog(p, d.amount, d.to);
    case 'bankrupt':
      return bankruptDialog(p, d);
    default:
      return Promise.resolve(true);
  }
}
