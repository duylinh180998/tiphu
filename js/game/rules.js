/**
 * Truy vấn luật chơi thuần túy trên trạng thái ván: giá trị, tiền thuê, độc quyền…
 */
import {
  RESORT_PRICE, RESORT_RENTS, SELL_RATE, BUYOUT_RATE, FESTIVAL_MULTS, INFLATION_START, INFLATION_STEP, MONOPOLY_MULT, COUPON_RATE,
  BUILD_CAP_BY_LAP,
} from '../config.js';
import { TILES, PROP_TILES, CITY_TILES, RESORT_TILES, GROUP_TILES, GROUPS, SIDE_TILES, SIDE_NAMES } from '../data/board.js';
import { r5 } from '../core/util.js';
import { store } from '../core/store.js';

const st = () => store.state;

export const P = (id) => st().players[id];
export const isBot = (p) => p.type === 'bot';
export const isRemote = (p) => p.type === 'remote';
export const isHumanType = (p) => p.type === 'human' || p.type === 'remote';
export const alivePlayers = () => st().players.filter((p) => !p.bankrupt);
export const ownedBy = (pid) => PROP_TILES.filter((i) => st().props[i].owner === pid);
export const citiesOf = (pid) => CITY_TILES.filter((i) => st().props[i].owner === pid);
export const resortCount = (pid) => RESORT_TILES.filter((i) => st().props[i].owner === pid).length;
export const groupCount = (g, pid) => GROUP_TILES[g].filter((i) => st().props[i].owner === pid).length;
export const groupComplete = (g, pid) => GROUP_TILES[g].every((i) => st().props[i].owner === pid);
export const completedGroups = (pid) => GROUPS.reduce((n, g, k) => n + (groupComplete(k, pid) ? 1 : 0), 0);
export const totalLevels = (pid) => citiesOf(pid).reduce((s, i) => s + st().props[i].level, 0);

export function propValue(i) {
  const t = TILES[i];
  const pr = st().props[i];
  if (!pr || pr.owner == null) return 0;
  return t.type === 'resort' ? RESORT_PRICE : t.eco.value[pr.level];
}
export const sellValue = (i) => r5(propValue(i) * SELL_RATE);
export const buyoutCost = (i) => propValue(i) * BUYOUT_RATE;

export function baseRent(i) {
  const t = TILES[i];
  const pr = st().props[i];
  if (!pr || pr.owner == null) return 0;
  if (t.type === 'resort') return RESORT_RENTS[resortCount(pr.owner)];
  return t.eco.rents[pr.level];
}

/** Hệ số lạm phát tiền thuê: 1 cho tới vòng 40, sau đó +5% mỗi vòng */
export function inflation() {
  const s = st();
  return s && s.round > INFLATION_START ? 1 + INFLATION_STEP * (s.round - INFLATION_START) : 1;
}
export const inflationPct = () => Math.round((inflation() - 1) * 100);

/** Thành phố i đang bị Mất Điện (không thu tiền thuê) */
export const isOutage = (i) => !!st().props[i] && st().props[i].outage > 0;

/** Chủ của thành phố i sở hữu trọn nhóm màu của nó */
export function hasMonopoly(i) {
  const t = TILES[i];
  const pr = st().props[i];
  return t.type === 'city' && !!pr && pr.owner != null && groupComplete(t.group, pr.owner);
}

/** Tiền thuê = thuê theo cấp x độc quyền màu (x2) x Lễ Hội x lạm phát; Mất Điện thì bằng 0 */
export function rentOf(i) {
  if (isOutage(i)) return 0;
  let r = baseRent(i);
  if (hasMonopoly(i)) r *= MONOPOLY_MULT;
  if (TILES[i].type === 'city' && st().festival.tile === i) r *= st().festival.mult;
  return r5(r * inflation());
}

/** Cấp công trình cao nhất người chơi được xây theo số lần đã qua Bắt Đầu (chưa tính Biểu Tượng) */
export const buildCap = (p) => BUILD_CAP_BY_LAP[Math.min(p.laps || 0, BUILD_CAP_BY_LAP.length - 1)];
/** Vòng (theo người chơi) mở khóa cấp L */
export const unlockLapOf = (L) => BUILD_CAP_BY_LAP.findIndex((cap) => cap >= L) + 1;

/** Giá phải trả khi người chơi đang giữ thẻ Giảm Giá */
export const discounted = (p, cost) => (p.coupon > 0 ? r5(cost * COUPON_RATE) : cost);

export const netWorth = (p) => p.money + ownedBy(p.id).reduce((s, i) => s + propValue(i), 0);
export const liquidation = (p) => ownedBy(p.id).reduce((s, i) => s + sellValue(i), 0);
export const nextFestivalMult = () => FESTIVAL_MULTS[Math.min(st().festival.editions + 1, FESTIVAL_MULTS.length) - 1];

/** Kiểm tra 3 điều kiện độc quyền cho một người chơi */
export function winConditionFor(pid) {
  const props = st().props;
  if (RESORT_TILES.every((i) => props[i].owner === pid)) {
    return { type: 'resort', icon: '🏖️', label: 'Độc Quyền Du Lịch', desc: 'Sở hữu cả 4 Khu Nghỉ Dưỡng' };
  }
  for (let s = 0; s < 4; s++) {
    if (SIDE_TILES[s].every((i) => props[i].owner === pid)) {
      return { type: 'line', icon: '🛣️', label: 'Độc Quyền 1 Cạnh', desc: `Sở hữu toàn bộ ${SIDE_NAMES[s]}` };
    }
  }
  if (completedGroups(pid) >= 3) {
    return { type: 'triple', icon: '🎨', label: 'Độc Quyền 3 Màu', desc: 'Sở hữu trọn vẹn 3 nhóm màu thành phố' };
  }
  return null;
}

/** Các ô mà nếu pid chiếm được sẽ thắng ngay lập tức */
export function criticalTiles(pid) {
  const props = st().props;
  const crit = new Set();
  const missR = RESORT_TILES.filter((i) => props[i].owner !== pid);
  if (missR.length === 1) crit.add(missR[0]);
  SIDE_TILES.forEach((side) => {
    const miss = side.filter((i) => props[i].owner !== pid);
    if (miss.length === 1) crit.add(miss[0]);
  });
  if (completedGroups(pid) >= 2) {
    GROUP_TILES.forEach((tiles) => {
      const miss = tiles.filter((i) => props[i].owner !== pid);
      if (miss.length === 1) crit.add(miss[0]);
    });
  }
  return crit;
}
