/**
 * Engine lượt chơi. Không gọi trực tiếp giao diện: mọi quyết định đi qua ask(),
 * mọi hiển thị đi qua view (view sẽ tự phát sóng tới máy khách khi chơi trực tuyến).
 */
import {
  SAVE_VERSION, TILE_COUNT, START_TILE, ISLAND_TILE, FESTIVAL_TILE, TOUR_TILE, TAX_TILE, START_SALARY, ISLAND_FEE,
  ISLAND_TURNS, TOUR_FEE, RESORT_PRICE, TAX_RATE, SELL_RATE, FESTIVAL_MULTS, INFLATION_START, INFLATION_STEP,
  LEVEL_ICONS, LEVEL_NAMES, MAX_LOG,
} from '../config.js';
import { TILES, RESORT_TILES, CITY_TILES, CHANCE_CARDS, CARD_BY_ID } from '../data/board.js';
import { store, S, saveGame } from '../core/store.js';
import { sleep, Session, GameOver, TurnAbort, Cancelled } from '../core/session.js';
import { rand, shuffle } from '../core/rng.js';
import { fmt, fmtFull, r5, esc } from '../core/util.js';
import {
  P, isBot, alivePlayers, ownedBy, citiesOf, resortCount, totalLevels, sellValue, buyoutCost, rentOf, netWorth,
  liquidation, nextFestivalMult, winConditionFor,
} from './rules.js';
import { ask } from './players.js';
import { AI } from './ai.js';
import { pn, tn } from './text.js';
import { view } from '../ui/view.js';

const st = () => store.state;

// ===================================================================
// Khởi tạo & nhật ký
// ===================================================================
export function createState(cfg) {
  return {
    v: SAVE_VERSION,
    status: 'playing',
    seed: (Math.random() * 4294967296) | 0,
    startMoney: cfg.startMoney,
    maxRounds: cfg.maxRounds || 0,
    speed: store.settings.speed,
    online: cfg.online || null,
    secrets: cfg.secrets || null,
    players: cfg.players.map((pc, i) => ({
      id: i,
      name: pc.name,
      type: pc.type,
      color: pc.color,
      avatar: pc.avatar,
      money: cfg.startMoney,
      pos: START_TILE,
      bankrupt: false,
      outRound: 0,
      island: 0,
      tour: false,
      freeRent: 0,
      escape: 0,
      online: pc.type === 'remote' ? true : undefined,
    })),
    props: TILES.map((t) => (t.type === 'city' || t.type === 'resort' ? { owner: null, level: 0 } : null)),
    festival: { tile: null, mult: 1, editions: 0 },
    current: 0,
    round: 1,
    doubles: 0,
    turns: 0,
    lastRoll: [5, 2],
    deck: [],
    out: [],
    log: [],
    winner: null,
    winReason: null,
  };
}

export function log(html, kind = '') {
  const s = st();
  if (!s) return;
  const entry = { r: s.round, h: html, k: kind };
  s.log.unshift(entry);
  if (s.log.length > MAX_LOG) s.log.length = MAX_LOG;
  view.log(entry);
}

export function startNewGame(cfg) {
  store.state = createState(cfg);
  st().deck = shuffle(CHANCE_CARDS.map((c) => c.id));
  const humans = st().players.filter((p) => !isBot(p)).length;
  const mode = cfg.online ? ' (trực tuyến)' : humans >= 2 ? ' (Pass & Play)' : '';
  log(`🎲 Ván đấu bắt đầu với ${st().players.length} người chơi${mode}. Chúc may mắn!`, 'good');
  saveGame();
}

// ===================================================================
// Vòng lặp lượt chơi
// ===================================================================
let loopToken = 0;

export async function runLoop() {
  const sid = Session.id;
  const token = ++loopToken;
  try {
    while (st() && st().status === 'playing') {
      if (sid !== Session.id || token !== loopToken) return;
      const p = st().players[st().current];
      if (p.bankrupt) {
        nextPlayer();
        continue;
      }
      // Điểm lưu: đầu mỗi lần lắc. Seed RNG nằm trong state nên kết quả không đổi khi tải lại.
      saveGame();
      view.sync();
      await turnIntro(p, st().doubles > 0);
      let again = false;
      try {
        again = await playSegment(p);
      } catch (e) {
        if (!(e instanceof TurnAbort)) throw e;
        again = false;
      }
      if (sid !== Session.id) return;
      view.sync();
      if (again && !p.bankrupt && st().status === 'playing') {
        await sleep(S().bot * 0.4);
        continue;
      }
      nextPlayer();
    }
  } catch (e) {
    if (e instanceof Cancelled || e instanceof GameOver) return;
    console.error(e);
    view.toast(`⚠️ Lỗi: ${esc(e && e.message ? e.message : e)}`, 'bad', 6000);
  }
}

function nextPlayer() {
  const s = st();
  s.doubles = 0;
  const n = s.players.length;
  let i = s.current;
  let wrapped = false;
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (i === 0) wrapped = true;
    if (!s.players[i].bankrupt) break;
  }
  s.current = i;
  s.turns++;
  if (wrapped) {
    if (s.maxRounds && s.round >= s.maxRounds) {
      const richest = alivePlayers().sort((a, b) => netWorth(b) - netWorth(a))[0];
      endGame(richest, { type: 'rounds', icon: '⏱️', label: 'Giàu Nhất Khi Hết Vòng', desc: `Tổng tài sản lớn nhất sau ${s.maxRounds} vòng` });
    }
    s.round++;
    log(`Vòng ${s.round}`, 'round');
    if (s.round === INFLATION_START + 1) {
      const pct = Math.round(INFLATION_STEP * 100);
      log(`📈 Bắt đầu <b>lạm phát</b>: từ vòng này tiền thuê tăng thêm ${pct}% mỗi vòng!`, 'bad');
      view.toast(`📈 Lạm phát! Tiền thuê tăng ${pct}% mỗi vòng`, 'warn', 3200);
    }
  }
}

async function turnIntro(p, bonus) {
  view.clearActions();
  if (bonus) {
    await view.banner(p.id, '🎲 Đổ đôi — được lắc thêm lượt!');
    return;
  }
  view.status('');
  view.sound('turn');
  // sub = null: mỗi màn hình tự ghi "Đến lượt bạn!" hay "Đang chơi" tùy người xem
  let sub = null;
  if (p.island > 0) sub = `🏝️ Đang kẹt trên Đảo Hoang (còn ${p.island} lượt)`;
  else if (p.tour) sub = '✈️ Sẵn sàng cho Chuyến Bay Thế Giới';
  await view.banner(p.id, sub);
}

/** Một lần lắc (hoặc hành động thay thế lắc). Trả về true nếu được lắc thêm (đổ đôi). */
async function playSegment(p) {
  if (p.island > 0) return islandSegment(p);
  if (p.tour) {
    p.tour = false;
    if (await tourSegment(p)) return false;
  }
  return rollSegment(p);
}

async function rollSegment(p) {
  const [d1, d2] = await rollDice(p);
  const dbl = d1 === d2;
  if (dbl) {
    st().doubles++;
    if (st().doubles >= 3) {
      log(`😱 ${pn(p)} đổ đôi 3 lần liên tiếp — bị đưa thẳng ra Đảo Hoang!`, 'bad');
      view.toast(`😱 3 lần đôi liên tiếp! ${esc(p.name)} bị đưa ra Đảo Hoang`, 'bad');
      await sendToIsland(p);
      return false;
    }
  }
  await moveSteps(p, d1 + d2);
  await landOn(p);
  return dbl && p.island === 0 && !p.bankrupt;
}

async function rollDice(p, { auto = false } = {}) {
  if (!auto) await ask(p, 'roll', { bonus: st().doubles > 0 });
  else if (isBot(p)) await sleep(S().bot);
  const d1 = 1 + Math.floor(rand() * 6);
  const d2 = 1 + Math.floor(rand() * 6);
  st().lastRoll = [d1, d2];
  view.status(`${pn(p)} đang lắc…`);
  await view.dice(d1, d2);
  const dbl = d1 === d2;
  view.status(`🎲 <b>${d1}</b> + <b>${d2}</b> = <span class="sum">${d1 + d2}</span>${dbl ? ' <span class="dbl-tag">ĐÔI!</span>' : ''}`);
  log(`🎲 ${pn(p)} đổ ${d1} + ${d2} = <b>${d1 + d2}</b>${dbl ? ' — <b class="dbl">ĐÔI!</b>' : ''}`, 'dice');
  if (dbl) view.sound('doubles');
  return [d1, d2];
}

async function islandSegment(p) {
  const choice = await ask(p, 'island', { canPay: p.money >= ISLAND_FEE, escape: p.escape, turns: p.island });
  if (choice === 'card' && p.escape > 0) {
    p.escape--;
    p.island = 0;
    log(`🛶 ${pn(p)} dùng Thuyền Cứu Hộ rời Đảo Hoang miễn phí!`, 'good');
    view.sound('chance');
    view.sync();
    return rollSegment(p);
  }
  if (choice === 'pay' && p.money >= ISLAND_FEE) {
    log(`💵 ${pn(p)} trả ${fmtFull(ISLAND_FEE)} để rời Đảo Hoang.`, 'pay');
    await pay(p, ISLAND_FEE, null);
    p.island = 0;
    view.sync();
    return rollSegment(p);
  }
  const [d1, d2] = await rollDice(p, { auto: true });
  if (d1 === d2) {
    p.island = 0;
    log(`🎉 ${pn(p)} đổ được đôi và thoát khỏi Đảo Hoang!`, 'good');
    view.toast(`🎉 ${esc(p.name)} thoát khỏi Đảo Hoang!`, 'good');
    await moveSteps(p, d1 + d2);
    await landOn(p);
    return false;
  }
  p.island--;
  if (p.island <= 0) {
    p.island = 0;
    log(`🏝️ ${pn(p)} đã chịu đủ ${ISLAND_TURNS} lượt — lượt sau được rời đảo.`);
  } else {
    log(`🏝️ ${pn(p)} không đổ được đôi, còn kẹt ${p.island} lượt.`);
  }
  view.sync();
  await sleep(S().bot * 0.6);
  return false;
}

async function tourSegment(p) {
  if (p.money < TOUR_FEE) {
    log(`✈️ ${pn(p)} không đủ ${fmtFull(TOUR_FEE)} để bay — đi tiếp như thường.`);
    return false;
  }
  const cands = [];
  for (let i = 0; i < TILE_COUNT; i++) if (i !== TOUR_TILE) cands.push(i);
  const target = await ask(p, 'tour', {
    cands,
    title: `✈️ <b>Chuyến Bay Thế Giới</b> — chọn ô muốn bay tới (phí ${fmt(TOUR_FEE)})`,
    cancelLabel: '🎲 Không bay, lắc xúc xắc',
  });
  if (target == null) {
    log(`✈️ ${pn(p)} không bay, lắc xúc xắc như thường.`);
    return false;
  }
  if (isBot(p)) await view.flash(target);
  log(`✈️ ${pn(p)} trả ${fmtFull(TOUR_FEE)} bay tới ${tn(target)}.`, 'pay');
  await pay(p, TOUR_FEE, null);
  await flyTo(p, target);
  await landOn(p);
  return true;
}

// ===================================================================
// Di chuyển
// ===================================================================
async function moveSteps(p, steps) {
  for (let s = 0; s < steps; s++) {
    p.pos = (p.pos + 1) % TILE_COUNT;
    view.step(p.id, p.pos);
    if (p.pos === START_TILE) passStart(p);
    await sleep(S().step);
  }
}

async function moveBack(p, steps) {
  for (let s = 0; s < steps; s++) {
    p.pos = (p.pos - 1 + TILE_COUNT) % TILE_COUNT;
    view.step(p.id, p.pos);
    await sleep(S().step);
  }
}

function passStart(p) {
  p.money += START_SALARY;
  view.moneyFx(p.id, START_SALARY);
  view.sound('coin');
  view.tileFx(START_TILE, `+${fmt(START_SALARY)}`, 'gain');
  log(`🏁 ${pn(p)} đi qua BẮT ĐẦU, nhận ${fmtFull(START_SALARY)}.`, 'good');
  view.sync();
}

/** Bay thẳng tới ô (đi tiến). Vòng qua/đáp xuống ô Bắt Đầu thì nhận lương. */
async function flyTo(p, target, { salary = true } = {}) {
  const from = p.pos;
  const passes = salary && (target === START_TILE || target < from);
  p.pos = target;
  view.status(`✈️ ${pn(p)} bay tới ${tn(target)}…`);
  view.sound('fly');
  view.fly(p.id, target, true);
  await sleep(S().fly);
  view.fly(p.id, target, false);
  if (passes) passStart(p);
}

async function sendToIsland(p) {
  await flyTo(p, ISLAND_TILE, { salary: false });
  onIsland(p);
}

// ===================================================================
// Tiền & phá sản
// ===================================================================
function gain(p, amount) {
  if (amount <= 0) return;
  p.money += amount;
  view.moneyFx(p.id, amount);
  view.sound('cash');
  view.sync();
}

/** Thanh toán. Thiếu tiền: buộc bán tài sản; không đủ thì phá sản. Trả về false nếu phá sản. */
async function pay(from, amount, to = null) {
  const amt = Math.max(0, Math.round(amount));
  if (amt === 0) return true;
  if (from.money < amt) {
    const ok = await raiseFunds(from, amt, to);
    if (!ok) {
      await goBankrupt(from, to);
      return false;
    }
  }
  from.money -= amt;
  view.moneyFx(from.id, -amt);
  if (to) {
    to.money += amt;
    view.moneyFx(to.id, amt);
  }
  view.sound('pay');
  view.sync();
  return true;
}

async function raiseFunds(p, amount, to) {
  const total = p.money + liquidation(p);
  if (total < amount) {
    if (!isBot(p)) await ask(p, 'bankrupt', { amount, to: to ? to.id : null, total });
    return false;
  }
  log(`⚠️ ${pn(p)} thiếu ${fmtFull(amount - p.money)}, buộc phải bán bớt tài sản.`, 'bad');
  const list = await ask(p, 'sell', { amount, to: to ? to.id : null });
  for (const i of list) {
    if (st().props[i].owner !== p.id) continue;
    sellProperty(p, i);
    if (isBot(p)) await sleep(S().bot * 0.4);
  }
  // Danh sách chưa đủ (ví dụ hết giờ): máy tự bán phần còn thiếu
  for (const i of AI.sellOrder(p)) {
    if (p.money >= amount) break;
    sellProperty(p, i);
  }
  return p.money >= amount;
}

function resetProperty(i) {
  const pr = st().props[i];
  pr.owner = null;
  pr.level = 0;
  if (st().festival.tile === i) {
    st().festival.tile = null;
    st().festival.mult = 1;
    log(`🎉 Lễ Hội tại ${tn(i)} đã kết thúc.`);
  }
}

function sellProperty(p, i) {
  const v = sellValue(i);
  resetProperty(i);
  p.money += v;
  view.moneyFx(p.id, v);
  log(`💱 ${pn(p)} bán ${tn(i)} cho ngân hàng, nhận ${fmtFull(v)}.`, 'bad');
  view.sound('cash');
  view.tileFx(i, '💱', 'loss');
  view.sync();
}

async function goBankrupt(p, creditor) {
  let total = p.money;
  ownedBy(p.id).forEach((i) => {
    total += sellValue(i);
    resetProperty(i);
  });
  p.money = 0;
  p.bankrupt = true;
  p.island = 0;
  p.tour = false;
  p.outRound = st().round;
  st().out.push(p.id);
  if (creditor && !creditor.bankrupt && total > 0) {
    creditor.money += total;
    view.moneyFx(creditor.id, total);
  }
  log(`💀 ${pn(p)} PHÁ SẢN!${creditor ? ` Toàn bộ ${fmtFull(total)} còn lại thuộc về ${pn(creditor)}.` : ''}`, 'bad');
  view.sound('bankrupt');
  view.toast(`💀 ${esc(p.name)} đã phá sản!`, 'bad', 2800);
  view.sync();
  await sleep(S().bot);
  checkWin();
  if (!isBot(p)) view.bankruptNotice(p.id);
  if (st().players[st().current].id === p.id) throw new TurnAbort();
}

// ===================================================================
// Thắng / thua
// ===================================================================
export function checkWin() {
  const s = st();
  if (!s || s.status !== 'playing') return;
  const alive = alivePlayers();
  if (alive.length === 1) {
    endGame(alive[0], { type: 'last', icon: '🏆', label: 'Người Trụ Lại Cuối Cùng', desc: 'Tất cả đối thủ đã phá sản' });
  }
  const cur = s.players[s.current];
  const order = [cur, ...alive.filter((p) => p.id !== cur.id)].filter((p) => !p.bankrupt);
  order.forEach((p) => {
    const w = winConditionFor(p.id);
    if (w) endGame(p, w);
  });
}

function endGame(winner, reason) {
  const s = st();
  if (s.status !== 'playing') throw new GameOver();
  s.status = 'gameover';
  s.winner = winner.id;
  s.winReason = reason;
  log(`🏆 ${pn(winner)} CHIẾN THẮNG — ${reason.icon} ${reason.label}!`, 'win');
  view.clearActions();
  view.status(`🏆 ${pn(winner)} chiến thắng!`);
  view.sync();
  saveGame();
  view.sound('win');
  view.gameOver(true);
  throw new GameOver();
}

// ===================================================================
// Xử lý khi dừng tại ô
// ===================================================================
async function landOn(p) {
  const i = p.pos;
  view.pulse(i);
  view.status(`📍 ${pn(p)} dừng tại ${tn(i)}`);
  view.sync();
  switch (TILES[i].type) {
    case 'start':
      await onStart(p);
      break;
    case 'city':
      await onCity(p, i);
      break;
    case 'resort':
      await onResort(p, i);
      break;
    case 'chance':
      await onChance(p);
      break;
    case 'tax':
      await onTax(p);
      break;
    case 'island':
      onIsland(p);
      break;
    case 'festival':
      await onFestival(p);
      break;
    case 'tour':
      onTour(p);
      break;
    default:
      break;
  }
  view.sync();
  checkWin();
}

async function onCity(p, i) {
  const pr = st().props[i];
  if (pr.owner == null) {
    await offerPurchase(p, i);
    return;
  }
  if (pr.owner === p.id) {
    await offerUpgrade(p, i, { landmark: true, title: 'Nâng cấp' });
    return;
  }
  await chargeRent(p, P(pr.owner), i);
  await offerBuyout(p, i);
}

async function offerPurchase(p, i) {
  const t = TILES[i];
  const options = [1, 2, 3].map((L) => ({ level: L, cost: t.eco.value[L], rent: t.eco.rents[L] }));
  if (p.money < options[0].cost) {
    log(`${pn(p)} không đủ tiền mua ${tn(i)} (${fmtFull(options[0].cost)}).`);
    if (!isBot(p)) view.toast(`Không đủ tiền mua ${esc(t.name)}`, 'bad');
    return;
  }
  const level = await ask(p, 'purchase', { i, options });
  if (!level) {
    log(`${pn(p)} bỏ qua ${tn(i)}.`);
    return;
  }
  const cost = t.eco.value[level];
  const pr = st().props[i];
  p.money -= cost;
  pr.owner = p.id;
  pr.level = level;
  view.moneyFx(p.id, -cost);
  log(`🏗️ ${pn(p)} mua ${tn(i)} — ${LEVEL_ICONS[level]} ${LEVEL_NAMES[level]} (${fmtFull(cost)}).`, 'buy');
  view.sound('buy');
  view.tileFx(i, LEVEL_ICONS[level], 'build');
  view.sync();
  checkWin();
}

async function offerUpgrade(p, i, { landmark = true, title = 'Nâng cấp' } = {}) {
  const t = TILES[i];
  const pr = st().props[i];
  if (t.type !== 'city' || pr.owner !== p.id) return;
  if (pr.level >= 4) {
    log(`🗼 ${tn(i)} của ${pn(p)} đã là Biểu Tượng.`);
    return;
  }
  const maxLevel = pr.level < 3 ? 3 : landmark ? 4 : 3;
  const options = [];
  for (let L = pr.level + 1; L <= maxLevel; L++) {
    options.push({ level: L, cost: t.eco.value[L] - t.eco.value[pr.level], rent: t.eco.rents[L] });
  }
  if (!options.length) {
    log(`${tn(i)} đã đạt Nhà cấp 3 — hãy dừng lại đây lần nữa để xây Biểu Tượng.`);
    return;
  }
  if (!options.some((o) => o.cost <= p.money)) {
    log(`${pn(p)} không đủ tiền nâng cấp ${tn(i)}.`);
    if (!isBot(p)) view.toast('Không đủ tiền để nâng cấp', 'bad');
    return;
  }
  const level = await ask(p, 'upgrade', { i, options, title });
  if (!level) return;
  const cost = t.eco.value[level] - t.eco.value[pr.level];
  p.money -= cost;
  pr.level = level;
  view.moneyFx(p.id, -cost);
  if (level === 4) {
    log(`🗼 ${pn(p)} xây BIỂU TƯỢNG tại ${tn(i)} (${fmtFull(cost)}) — không ai có thể mua lại!`, 'buy');
    view.sound('landmark');
    view.tileFx(i, '🗼', 'build big');
    view.toast(`🗼 ${esc(p.name)} xây Biểu Tượng tại ${esc(t.name)}!`, 'gold');
  } else {
    log(`🔨 ${pn(p)} nâng cấp ${tn(i)} lên ${LEVEL_ICONS[level]} ${LEVEL_NAMES[level]} (${fmtFull(cost)}).`, 'buy');
    view.sound('build');
    view.tileFx(i, LEVEL_ICONS[level], 'build');
  }
  view.sync();
}

async function chargeRent(p, owner, i) {
  const rent = rentOf(i);
  if (rent <= 0) return;
  if (p.freeRent > 0) {
    const use = await ask(p, 'shield', { i, rent, owner: owner.id, cards: p.freeRent });
    if (use) {
      p.freeRent--;
      log(`🛡️ ${pn(p)} dùng Thẻ Miễn Thuê tại ${tn(i)} (tiết kiệm ${fmtFull(rent)}).`, 'good');
      view.sound('chance');
      view.tileFx(i, '🛡️', 'gain');
      view.sync();
      return;
    }
  }
  const fest = TILES[i].type === 'city' && st().festival.tile === i ? ` (🎉x${st().festival.mult})` : '';
  log(`💸 ${pn(p)} trả ${fmtFull(rent)} tiền thuê${fest} cho ${pn(owner)} tại ${tn(i)}.`, 'pay');
  view.tileFx(i, `-${fmt(rent)}`, 'loss');
  await pay(p, rent, owner);
}

async function offerBuyout(p, i) {
  const t = TILES[i];
  const pr = st().props[i];
  if (p.bankrupt || t.type !== 'city' || pr.owner == null || pr.owner === p.id) return;
  if (pr.level >= 4) {
    log(`🔒 ${tn(i)} là Biểu Tượng — không thể mua lại.`);
    return;
  }
  const cost = buyoutCost(i);
  const owner = P(pr.owner);
  if (p.money < cost) {
    if (!isBot(p)) view.toast(`Cần ${fmtFull(cost)} để mua lại ${esc(t.name)}`, 'info');
    return;
  }
  const yes = await ask(p, 'buyout', { i, cost });
  if (!yes) return;
  p.money -= cost;
  owner.money += cost;
  view.moneyFx(p.id, -cost);
  view.moneyFx(owner.id, cost);
  pr.owner = p.id;
  log(`💥 ${pn(p)} MUA LẠI ${tn(i)} từ ${pn(owner)} với giá ${fmtFull(cost)}!`, 'buyout');
  view.sound('buyout');
  view.tileFx(i, '💥', 'big');
  view.toast(`💥 ${esc(p.name)} mua lại ${esc(t.name)} từ ${esc(owner.name)}!`, 'warn');
  view.sync();
  checkWin();
  await offerUpgrade(p, i, { landmark: false, title: 'Nâng cấp sau khi mua lại' });
}

async function onResort(p, i) {
  const pr = st().props[i];
  if (pr.owner == null) {
    if (p.money < RESORT_PRICE) {
      log(`${pn(p)} không đủ tiền mua Khu Nghỉ Dưỡng ${tn(i)}.`);
      if (!isBot(p)) view.toast(`Không đủ tiền mua ${esc(TILES[i].name)}`, 'bad');
      return;
    }
    const yes = await ask(p, 'resort', { i });
    if (!yes) {
      log(`${pn(p)} bỏ qua ${tn(i)}.`);
      return;
    }
    p.money -= RESORT_PRICE;
    pr.owner = p.id;
    pr.level = 1;
    view.moneyFx(p.id, -RESORT_PRICE);
    log(`🏖️ ${pn(p)} mua Khu Nghỉ Dưỡng ${tn(i)} (${fmtFull(RESORT_PRICE)}) — đang có ${resortCount(p.id)}/4 khu.`, 'buy');
    view.sound('buy');
    view.tileFx(i, '🏖️', 'build');
    view.sync();
    checkWin();
    return;
  }
  if (pr.owner === p.id) {
    log(`🏖️ ${pn(p)} nghỉ dưỡng tại ${tn(i)} của chính mình.`);
    return;
  }
  await chargeRent(p, P(pr.owner), i);
}

async function onStart(p) {
  const cands = citiesOf(p.id).filter((i) => {
    const L = st().props[i].level;
    return L < 3 && TILES[i].eco.costs[L + 1] <= p.money;
  });
  if (!cands.length) {
    log(`🏁 ${pn(p)} dừng đúng ô BẮT ĐẦU.`);
    return;
  }
  const target = await ask(p, 'select', {
    purpose: 'start',
    cands,
    title: '🏁 Dừng đúng ô <b>BẮT ĐẦU</b>! Chọn 1 thành phố để nâng cấp',
    cancelLabel: 'Bỏ qua',
  });
  if (target == null) {
    log(`🏁 ${pn(p)} dừng đúng ô BẮT ĐẦU nhưng không nâng cấp.`);
    return;
  }
  if (isBot(p)) await view.flash(target);
  await offerUpgrade(p, target, { landmark: false, title: 'Nâng cấp từ ô Bắt Đầu' });
}

async function onTax(p) {
  const amt = Math.round(p.money * TAX_RATE);
  if (amt <= 0) {
    log(`💸 ${pn(p)} không có tiền mặt để nộp thuế.`);
    return;
  }
  log(`💸 ${pn(p)} nộp thuế 10% tiền mặt: ${fmtFull(amt)}.`, 'pay');
  view.tileFx(TAX_TILE, `-${fmt(amt)}`, 'loss');
  await pay(p, amt, null);
}

function onIsland(p) {
  p.island = ISLAND_TURNS;
  log(`🏝️ ${pn(p)} mắc kẹt trên Đảo Hoang ${ISLAND_TURNS} lượt!`, 'bad');
  view.sound('island');
  view.toast(`🏝️ ${esc(p.name)} mắc kẹt trên Đảo Hoang!`, 'info');
  view.sync();
}

async function onFestival(p) {
  const cands = citiesOf(p.id);
  if (!cands.length) {
    log(`🎉 ${pn(p)} chưa có thành phố nào để tổ chức Lễ Hội.`);
    return;
  }
  const target = await ask(p, 'select', {
    purpose: 'festival',
    cands,
    title: `🎉 Chọn thành phố tổ chức <b>Lễ Hội Thế Giới lần ${st().festival.editions + 1}</b> — tiền thuê <b>x${nextFestivalMult()}</b>`,
  });
  if (isBot(p)) await view.flash(target);
  const f = st().festival;
  f.editions++;
  f.mult = FESTIVAL_MULTS[Math.min(f.editions, FESTIVAL_MULTS.length) - 1];
  f.tile = target;
  log(`🎉 Lễ Hội Thế Giới lần ${f.editions} khai mạc tại ${tn(target)} — tiền thuê x${f.mult}!`, 'good');
  view.sound('festival');
  view.tileFx(target, `🎉x${f.mult}`, 'big');
  view.toast(`🎉 Lễ Hội lần ${f.editions} tại ${esc(TILES[target].name)} — thuê x${f.mult}!`, 'gold');
  view.sync();
}

function onTour(p) {
  p.tour = true;
  log(`✈️ ${pn(p)} tới Sân Bay — lượt sau có thể bay tới bất kỳ ô nào (${fmtFull(TOUR_FEE)}).`);
  view.sound('fly');
  view.sync();
}

async function onChance(p) {
  if (!st().deck.length) st().deck = shuffle(CHANCE_CARDS.map((c) => c.id));
  const card = CARD_BY_ID[st().deck.pop()];
  view.sound('chance');
  log(`🎁 ${pn(p)} rút thẻ Cơ Hội: <b>${card.icon} ${esc(card.title)}</b>`, 'chance');
  if (isBot(p)) await view.card(p.id, card.id);
  else {
    view.card(p.id, card.id);
    await ask(p, 'card', { id: card.id });
  }
  await applyCard(p, card);
}

async function applyCard(p, card) {
  switch (card.id) {
    case 'lottery':
      gain(p, 200);
      break;
    case 'bonus':
      gain(p, 100);
      break;
    case 'refund':
      gain(p, 150);
      break;
    case 'birthday':
      for (const o of st().players) {
        if (o.id === p.id || o.bankrupt) continue;
        log(`🎂 ${pn(o)} tặng ${pn(p)} ${fmtFull(50)}.`);
        await pay(o, 50, p);
      }
      break;
    case 'fine':
      await pay(p, 100, null);
      break;
    case 'hospital':
      await pay(p, 150, null);
      break;
    case 'repair': {
      const lv = totalLevels(p.id);
      if (lv > 0) {
        log(`🔧 ${pn(p)} có ${lv} cấp nhà — trả ${fmtFull(lv * 20)} phí bảo trì.`, 'pay');
        await pay(p, lv * 20, null);
      } else {
        log(`🔧 ${pn(p)} chưa có công trình nào — không mất phí.`);
      }
      break;
    }
    case 'charity':
      for (const o of st().players) {
        if (o.id === p.id || o.bankrupt) continue;
        await pay(p, 30, o);
      }
      break;
    case 'shipwreck':
      await sendToIsland(p);
      break;
    case 'home':
      await flyTo(p, START_TILE);
      await landOn(p);
      break;
    case 'festival':
      await flyTo(p, FESTIVAL_TILE);
      await landOn(p);
      break;
    case 'ticket':
      await flyTo(p, TOUR_TILE);
      await landOn(p);
      break;
    case 'back3':
      await moveBack(p, 3);
      await landOn(p);
      break;
    case 'vacation': {
      const target = RESORT_TILES.find((r) => r > p.pos);
      await flyTo(p, target == null ? RESORT_TILES[0] : target);
      await landOn(p);
      break;
    }
    case 'freeUp':
      await cardFreeUpgrade(p);
      break;
    case 'shield':
      p.freeRent++;
      break;
    case 'boat':
      p.escape++;
      break;
    case 'sellHouse':
      await cardSellHouse(p);
      break;
    case 'evict':
      await cardEvict(p);
      break;
    default:
      break;
  }
  view.sync();
}

async function cardFreeUpgrade(p) {
  const cands = citiesOf(p.id).filter((i) => st().props[i].level < 3);
  if (!cands.length) {
    log(`🛠️ ${pn(p)} không có thành phố phù hợp — nhận ${fmtFull(100)} thay thế.`);
    gain(p, 100);
    return;
  }
  const target = await ask(p, 'select', { purpose: 'freeUp', cands, title: '🛠️ Chọn thành phố được <b>nâng cấp miễn phí</b> thêm 1 cấp' });
  if (isBot(p)) await view.flash(target);
  const pr = st().props[target];
  pr.level++;
  log(`🛠️ ${pn(p)} nâng cấp miễn phí ${tn(target)} lên ${LEVEL_ICONS[pr.level]} ${LEVEL_NAMES[pr.level]}.`, 'good');
  view.sound('build');
  view.tileFx(target, LEVEL_ICONS[pr.level], 'build');
  view.sync();
}

async function cardSellHouse(p) {
  const cands = citiesOf(p.id).filter((i) => st().props[i].level < 4);
  if (!cands.length) {
    log(`🏚️ ${pn(p)} không có nhà nào phải bán — thoát nạn!`);
    return;
  }
  const target = await ask(p, 'select', { purpose: 'sellHouse', cands, title: '🏚️ <b>Ép bán nhà</b>: chọn thành phố phải bán bớt 1 cấp (nhận lại 50%)' });
  if (isBot(p)) await view.flash(target);
  const pr = st().props[target];
  const refund = r5(TILES[target].eco.costs[pr.level] * SELL_RATE);
  if (pr.level <= 1) {
    resetProperty(target);
    log(`🏚️ ${pn(p)} buộc phải bán ${tn(target)} về ngân hàng, nhận ${fmtFull(refund)}.`, 'bad');
  } else {
    pr.level--;
    log(`🏚️ ${pn(p)} bán bớt 1 cấp nhà tại ${tn(target)}, nhận ${fmtFull(refund)}.`, 'bad');
  }
  p.money += refund;
  view.moneyFx(p.id, refund);
  view.sound('pay');
  view.tileFx(target, '🏚️', 'loss');
  view.sync();
}

async function cardEvict(p) {
  const cands = CITY_TILES.filter((i) => {
    const pr = st().props[i];
    return pr.owner != null && pr.owner !== p.id && pr.level < 4;
  });
  if (!cands.length) {
    log('📜 Không có thành phố nào của đối thủ có thể bị thu hồi.');
    return;
  }
  const target = await ask(p, 'select', { purpose: 'evict', cands, title: '📜 <b>Thu hồi đất</b>: chọn 1 thành phố của đối thủ buộc bán về ngân hàng' });
  if (isBot(p)) await view.flash(target);
  const owner = P(st().props[target].owner);
  const v = sellValue(target);
  resetProperty(target);
  owner.money += v;
  view.moneyFx(owner.id, v);
  log(`📜 ${pn(p)} thu hồi ${tn(target)} của ${pn(owner)}! ${pn(owner)} nhận lại ${fmtFull(v)}.`, 'buyout');
  view.sound('buyout');
  view.tileFx(target, '📜', 'big');
  view.sync();
}
