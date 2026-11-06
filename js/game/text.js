/**
 * Định dạng tên người chơi / tên ô trong nhật ký và dòng trạng thái.
 */
import { esc } from '../core/util.js';
import { TILES } from '../data/board.js';

export const pn = (p) => `<b class="pn" style="color:${p.color}">${esc(p.name)}</b>`;
export const tn = (i) => `<b class="tn">${esc(TILES[i].name)}</b>`;
