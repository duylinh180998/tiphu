/**
 * AI của máy. Mọi quyết định đi qua AI.decide(p, kind, data) với cùng định dạng
 * như hộp thoại của người chơi, nên máy cũng có thể "chơi thay" người mất kết nối.
 */
import { RESORT_PRICE, ISLAND_FEE, TOUR_FEE, TILE_COUNT, TOUR_TILE, START_SALARY, TAX_RATE, HOTEL, LANDMARK } from '../config.js';
import { TILES, PROP_TILES, GROUP_TILES, SIDE_TILES, sideOf } from '../data/board.js';
import { store } from '../core/store.js';
import { rand } from '../core/rng.js';
import {
  alivePlayers, rentOf, baseRent, resortCount, groupCount, groupComplete, completedGroups, citiesOf,
  ownedBy, propValue, sellValue, buyoutCost, criticalTiles, netWorth,
} from './rules.js';

const props = () => store.state.props;

export const AI = {
  /** Số tiền nên giữ lại để không phá sản khi dẫm phải ô đắt của đối thủ */
  reserve(p) {
    const rents = [];
    PROP_TILES.forEach((i) => {
      const o = props()[i].owner;
      if (o != null && o !== p.id) rents.push(rentOf(i));
    });
    rents.sort((a, b) => b - a);
    const top = rents.slice(0, 3);
    const avg = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
    return Math.round(Math.min(120 + avg * 0.55, 1300));
  },

  /** Giá trị phòng thủ khi chiếm ô trống i (ngăn đối thủ tiến gần chiến thắng) */
  threatOf(i, me) {
    let v = 0;
    const t = TILES[i];
    alivePlayers().forEach((o) => {
      if (o.id === me) return;
      if (criticalTiles(o.id).has(i)) v = Math.max(v, 100);
      if (t.type === 'resort' && resortCount(o.id) >= 2) v = Math.max(v, 30);
      if (SIDE_TILES[sideOf(i)].filter((j) => props()[j].owner === o.id).length >= 4) v = Math.max(v, 30);
      if (t.type === 'city') {
        const g = t.group;
        if (groupCount(g, o.id) === GROUP_TILES[g].length - 1 && completedGroups(o.id) >= 1) v = Math.max(v, 35);
      }
    });
    return v;
  },

  /** Giá trị phát triển của mình khi chiếm ô i */
  gainOf(i, me) {
    const t = TILES[i];
    let v = 0;
    if (t.type === 'resort') {
      v += 15 + resortCount(me) * 22;
    } else {
      const g = t.group;
      const have = groupCount(g, me);
      const total = GROUP_TILES[g].length;
      const others = GROUP_TILES[g].some((j) => j !== i && props()[j].owner != null && props()[j].owner !== me);
      if (have === total - 1 && props()[i].owner !== me) v += 50;
      else if (have > 0 && !others) v += 18;
      else if (!others) v += 8;
    }
    v += SIDE_TILES[sideOf(i)].filter((j) => props()[j].owner === me).length * 5;
    return v;
  },

  /** Mua đứt ô i của X sẽ phá thế độc quyền của X tới mức nào (chỉ thành phố) */
  disruptOf(i, X) {
    if (X == null) return 0;
    const t = TILES[i];
    let v = 0;
    const sc = SIDE_TILES[sideOf(i)].filter((j) => props()[j].owner === X).length;
    if (sc >= 5) v = Math.max(v, 100);
    else if (sc === 4) v = Math.max(v, 35);
    if (t.type === 'city') {
      const comp = completedGroups(X);
      const g = t.group;
      const gc = groupCount(g, X);
      const total = GROUP_TILES[g].length;
      if (gc === total) v = Math.max(v, comp >= 2 ? 90 : 30);
      else if (gc === total - 1 && comp >= 2) v = Math.max(v, 70);
    }
    return v;
  },

  purchaseLevel(p, i, opts) {
    if (!opts.length) return 0;
    if (criticalTiles(p.id).has(i)) return opts[0].level;
    const reserve = AI.reserve(p);
    const block = AI.threatOf(i, p.id);
    const gainV = AI.gainOf(i, p.id);
    let keep = reserve;
    if (block >= 100) keep = reserve * 0.2;
    else if (gainV >= 50) keep = reserve * 0.55;
    else if (block >= 30) keep = reserve * 0.7;
    const ok = opts.filter((o) => p.money - o.cost >= keep);
    if (!ok.length) return 0;
    let best = ok[ok.length - 1].level;
    const unowned = PROP_TILES.filter((j) => props()[j].owner == null).length;
    if (unowned > PROP_TILES.length * 0.4 && gainV < 50) best = Math.min(best, p.money > store.state.startMoney ? 3 : 2);
    return best;
  },

  wantResort(p, i) {
    if (criticalTiles(p.id).has(i)) return true;
    const left = p.money - RESORT_PRICE;
    if (AI.threatOf(i, p.id) >= 100) return left >= 0;
    return left >= AI.reserve(p) * 0.75;
  },

  upgradeLevel(p, i, opts) {
    const reserve = AI.reserve(p);
    const lm = opts.find((o) => o.level === LANDMARK);
    if (lm) return p.money - lm.cost >= reserve * 0.55 ? LANDMARK : 0;
    let best = 0;
    opts.forEach((o) => {
      if (p.money - o.cost >= reserve) best = o.level;
    });
    return best;
  },

  wantBuyout(p, i, cost) {
    if (p.money < cost) return false;
    if (criticalTiles(p.id).has(i)) return true;
    const reserve = AI.reserve(p);
    const left = p.money - cost;
    const disrupt = AI.disruptOf(i, props()[i].owner);
    if (disrupt >= 90 && left >= reserve * 0.3) return true;
    if (disrupt >= 60 && left >= reserve * 0.6) return true;
    if (AI.gainOf(i, p.id) >= 50 && left >= reserve * 0.9) return true;
    if (left >= reserve * 1.8 + 300 && rand() < 0.6) return true;
    return false;
  },

  islandChoice(p, canPay) {
    const unowned = PROP_TILES.filter((j) => props()[j].owner == null).length;
    let danger = 0;
    PROP_TILES.forEach((j) => {
      const o = props()[j].owner;
      if (o != null && o !== p.id) danger += rentOf(j);
    });
    danger /= TILE_COUNT;
    const wantLeave = unowned >= 4 && danger < p.money * 0.06;
    if (!wantLeave) return 'roll';
    if (canPay && p.money - ISLAND_FEE >= AI.reserve(p) + 100) return 'pay';
    return 'roll';
  },

  tourTarget(p) {
    if (p.money < TOUR_FEE) return null;
    const reserve = AI.reserve(p);
    const money = p.money - TOUR_FEE;
    const myCrit = criticalTiles(p.id);
    const hasUpgradable = citiesOf(p.id).some((i) => props()[i].level < LANDMARK);
    let best = null;
    let bestScore = 20;
    for (let j = 0; j < TILE_COUNT; j++) {
      if (j === TOUR_TILE) continue;
      const t = TILES[j];
      const pr = props()[j];
      const passStartBonus = j < TOUR_TILE;
      const cash = money + (passStartBonus ? START_SALARY : 0);
      let s = passStartBonus ? 25 : 0;
      if (t.type === 'city' || t.type === 'resort') {
        if (pr.owner == null) {
          const price = t.type === 'resort' ? RESORT_PRICE : t.eco.value[1];
          if (price <= cash) {
            if (myCrit.has(j)) s += 1000;
            else s += 30 + AI.gainOf(j, p.id) + AI.threatOf(j, p.id) * 0.8 - (cash - price < reserve ? 25 : 0);
          } else {
            s -= 10;
          }
        } else if (pr.owner === p.id) {
          if (t.type === 'city') {
            if (pr.level === HOTEL && t.eco.costs[LANDMARK] <= cash - reserve * 0.6) s += 70;
            else if (pr.level < HOTEL && t.eco.costs[pr.level + 1] <= cash - reserve) s += 25;
            else s += 5;
          } else {
            s += 5;
          }
        } else {
          const rent = rentOf(j);
          s -= rent * 0.5;
          const canBuyout = t.type === 'city' && pr.level < LANDMARK;
          if (myCrit.has(j) && canBuyout && cash - rent >= buyoutCost(j)) s += 900;
        }
      } else if (t.type === 'start') {
        s += 35 + (hasUpgradable ? 15 : 0);
      } else if (t.type === 'chance') {
        s += 12;
      } else if (t.type === 'festival') {
        s += citiesOf(p.id).length ? 40 : 0;
      } else if (t.type === 'island') {
        s -= 40;
      } else if (t.type === 'tax') {
        s -= netWorth(p) * TAX_RATE * 0.5;
      }
      if (s > bestScore) {
        bestScore = s;
        best = j;
      }
    }
    return best;
  },

  festivalTarget(p, cands) {
    return cands.slice().sort((a, b) => baseRent(b) - baseRent(a) || props()[b].level - props()[a].level)[0];
  },

  startTarget(p, cands) {
    const reserve = AI.reserve(p);
    let best = null;
    let bestScore = 0;
    cands.forEach((i) => {
      const t = TILES[i];
      const L = props()[i].level;
      const cost = t.eco.costs[L + 1];
      if (p.money - cost < reserve * 0.8) return;
      const score = (t.eco.rents[L + 1] - t.eco.rents[L]) / cost + (groupComplete(t.group, p.id) ? 0.5 : 0) + (L === HOTEL ? 0.6 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  },

  /** Động Đất: phá công trình đem lại nhiều tiền thuê nhất cho đối thủ; ưu tiên phá Biểu Tượng (mất bảo hộ) */
  earthquakeTarget(p, cands) {
    const leader = alivePlayers().filter((o) => o.id !== p.id).sort((a, b) => netWorth(b) - netWorth(a))[0];
    const score = (i) => rentOf(i) + (props()[i].level === LANDMARK ? 300 : 0) + (leader && props()[i].owner === leader.id ? 100 : 0);
    return cands.slice().sort((a, b) => score(b) - score(a))[0];
  },

  /** Mất Điện: cắt thành phố thu tiền thuê cao nhất của đối thủ; không có thì bỏ qua */
  outageTarget(p, cands) {
    const theirs = cands.filter((i) => props()[i].owner !== p.id);
    if (!theirs.length) return null;
    return theirs.sort((a, b) => rentOf(b) - rentOf(a))[0];
  },

  /** Dẹp Lễ Hội: xóa lễ hội ở thành phố của đối thủ có tiền thuê cao nhất; không có thì bỏ qua */
  noFestTarget(p, cands) {
    const theirs = cands.filter((i) => props()[i].owner != null && props()[i].owner !== p.id);
    if (!theirs.length) return null;
    return theirs.sort((x, y) => rentOf(y) - rentOf(x))[0];
  },

  evictTarget(p, cands) {
    const score = (i) => AI.disruptOf(i, props()[i].owner) * 10 + propValue(i) + (AI.gainOf(i, p.id) >= 50 ? 300 : 0);
    return cands.slice().sort((a, b) => score(b) - score(a))[0];
  },

  /** Thứ tự bán tài sản: ít giá trị chiến lược nhất trước */
  sellOrder(p) {
    const keep = (i) => {
      const t = TILES[i];
      const pr = props()[i];
      let s = propValue(i);
      if (t.type === 'resort') {
        s += 70 * resortCount(p.id);
      } else {
        if (groupComplete(t.group, p.id)) s += 260;
        if (pr.level === LANDMARK) s += 420;
        if (store.state.festival.tile === i) s += 220;
        else if (store.state.street && (store.state.street.tiles || []).includes(i)) s += 120;
      }
      return s;
    };
    return ownedBy(p.id).sort((a, b) => keep(a) - keep(b));
  },

  /** Danh sách tài sản cần bán để đủ trả khoản nợ */
  sellList(p, amount) {
    const list = [];
    let cash = p.money;
    AI.sellOrder(p).forEach((i) => {
      if (cash >= amount) return;
      list.push(i);
      cash += sellValue(i);
    });
    return list;
  },

  /** Đánh giá nhanh việc dừng ở ô j (điểm càng cao càng có lợi) */
  landingScore(p, j) {
    const t = TILES[j];
    const pr = props()[j];
    if (t.type === 'city' || t.type === 'resort') {
      if (pr.owner == null) {
        const price = t.type === 'resort' ? RESORT_PRICE : t.eco.value[1];
        return price <= p.money ? 30 + AI.gainOf(j, p.id) + AI.threatOf(j, p.id) : 0;
      }
      if (pr.owner === p.id) return t.type === 'city' && pr.level < LANDMARK ? 20 : 5;
      const rent = rentOf(j);
      return -(rent > p.money ? rent * 2 : rent);
    }
    switch (t.type) {
      case 'start':
        return 60;
      case 'festival':
        return citiesOf(p.id).length ? 30 : 0;
      case 'tour':
        return 20;
      case 'chance':
        return 10;
      case 'island':
        return -60;
      case 'tax':
        return -netWorth(p) * TAX_RATE;
      default:
        return 0;
    }
  },

  /** Lắc thường hay dùng Chẵn/Lẻ: so sánh kỳ vọng của từng cách lắc */
  rollChoice(p, d) {
    if (!(d.parity > 0)) return 'roll';
    const sum = { all: 0, even: 0, odd: 0 };
    const weight = { all: 0, even: 0, odd: 0 };
    for (let n = 2; n <= 12; n++) {
      const prob = 6 - Math.abs(n - 7);
      const score = AI.landingScore(p, (p.pos + n) % TILE_COUNT);
      const k = n % 2 === 0 ? 'even' : 'odd';
      sum.all += prob * score;
      weight.all += prob;
      sum[k] += prob * score;
      weight[k] += prob;
    }
    const base = sum.all / weight.all;
    const even = sum.even / weight.even;
    const odd = sum.odd / weight.odd;
    // Chỉ dùng khi lợi thế rõ rệt: né được tiền thuê lớn hoặc nhắm trúng ô quan trọng
    if (Math.max(even, odd) - base < 45) return 'roll';
    return even >= odd ? 'even' : 'odd';
  },

  selectTarget(p, d) {
    switch (d.purpose) {
      case 'start':
        return AI.startTarget(p, d.cands);
      case 'festival':
        return AI.festivalTarget(p, d.cands);
      case 'earthquake':
        return AI.earthquakeTarget(p, d.cands);
      case 'outage':
        return AI.outageTarget(p, d.cands);
      case 'nofest':
        return AI.noFestTarget(p, d.cands);
      case 'evict':
        return AI.evictTarget(p, d.cands);
      default:
        return d.cands[0];
    }
  },

  /** Điểm vào duy nhất: trả lời một yêu cầu quyết định */
  decide(p, kind, d = {}) {
    switch (kind) {
      case 'roll':
        return AI.rollChoice(p, d);
      case 'island':
        return AI.islandChoice(p, d.canPay);
      case 'tour':
        return AI.tourTarget(p);
      case 'purchase':
        return AI.purchaseLevel(p, d.i, d.options.filter((o) => o.cost <= p.money));
      case 'upgrade':
        return AI.upgradeLevel(p, d.i, d.options.filter((o) => o.cost <= p.money));
      case 'buyout':
        return AI.wantBuyout(p, d.i, d.cost);
      case 'resort':
        return AI.wantResort(p, d.i);
      case 'select':
        return AI.selectTarget(p, d);
      case 'sell':
        return AI.sellList(p, d.amount);
      default:
        return true;
    }
  },

  /** Lựa chọn mặc định khi người chơi hết giờ: bỏ qua mọi hành động không bắt buộc */
  timeoutDefault(p, kind, d = {}) {
    switch (kind) {
      case 'roll':
        return 'roll';
      case 'island':
        return 'roll';
      case 'tour':
        return null;
      case 'purchase':
      case 'upgrade':
        return 0;
      case 'buyout':
      case 'resort':
        return false;
      case 'select':
        return d.cancelLabel ? null : AI.selectTarget(p, d);
      default:
        return AI.decide(p, kind, d);
    }
  },
};
