/**
 * Lớp trình bày mà engine gọi. Mỗi lệnh vừa hiển thị trên máy này vừa phát ra
 * một sự kiện cho các "sink" (module chủ phòng dùng sink để phát sóng tới máy khách).
 * Máy khách nhận sự kiện và gọi applyEvent() để hiển thị y hệt.
 */
import { store, S } from '../core/store.js';
import { sleep } from '../core/session.js';
import { sanitizeHTML } from '../core/util.js';
import { TILE_COUNT } from '../config.js';
import { CARD_BY_ID } from '../data/board.js';
import { P, isBot } from '../game/rules.js';
import { renderTiles, pulseTile, markChosen } from './board3d.js';
import { layoutTokens, hopToken, flyToken } from './tokens.js';
import { startDiceRoll, finishDiceRoll, setDiceFaces } from './dice.js';
import { renderPlayers, renderPills, setStatus, clearActions, renderLog, setTimer, playerMoneyFx, playerEmote } from './hud.js';
import { banner, toast, tileFx } from './fx.js';
import { Sound } from './audio.js';
import { chanceDialog, gameOverDialog, bankruptNotice } from './dialogs.js';
import { addChatMessage, cleanChatText } from './chat.js';

const sinks = new Set();
export function addViewSink(fn) {
  sinks.add(fn);
  return () => sinks.delete(fn);
}
const emit = (ev) => sinks.forEach((fn) => fn(ev));

function renderAll() {
  renderTiles();
  renderPlayers();
  renderPills();
  layoutTokens();
}

/** Thẻ Cơ Hội hiện tự động ở mọi màn hình, trừ màn hình của chính người rút (họ thấy thẻ có nút OK) */
function cardShownHere(pid) {
  if (store.role === 'guest') return pid !== store.myId;
  return P(pid).type !== 'human';
}

function bankruptIsMine(pid) {
  if (store.role === 'guest') return pid === store.myId;
  return P(pid).type === 'human';
}

/** Dòng phụ của băng rôn lượt chơi khi engine không chỉ định (tùy người đang xem) */
function bannerSub(pid, sub) {
  if (sub) return sub;
  const p = P(pid);
  if (isBot(p)) return '🤖 Máy đang chơi';
  return bankruptIsMine(pid) ? '👤 Đến lượt bạn!' : '🎲 Đang chơi';
}

function onlyBotsOrRemoteLeft() {
  return !store.state.players.some((q) => q.type === 'human' && !q.bankrupt);
}

export const view = {
  sync() {
    renderAll();
    emit({ t: 'sync' });
  },
  status(html) {
    setStatus(html);
    emit({ t: 'status', html });
  },
  clearActions() {
    clearActions();
    emit({ t: 'clear' });
  },
  log(entry) {
    renderLog();
    emit({ t: 'log', e: entry });
  },
  async banner(pid, sub) {
    emit({ t: 'banner', pid, sub });
    await banner(P(pid), bannerSub(pid, sub));
  },
  async dice(d1, d2) {
    emit({ t: 'dice', d: [d1, d2] });
    const ms = startDiceRoll(d1, d2);
    await sleep(ms);
    finishDiceRoll(d1, d2);
  },
  step(pid, pos) {
    emit({ t: 'step', pid, pos });
    layoutTokens();
    hopToken(pid);
    Sound.play('step');
  },
  fly(pid, pos, on) {
    emit({ t: 'fly', pid, pos, on });
    flyToken(pid, on);
  },
  tileFx(i, html, kind) {
    emit({ t: 'tileFx', i, html, kind });
    tileFx(i, html, kind);
  },
  moneyFx(pid, delta) {
    emit({ t: 'money', pid, delta });
    playerMoneyFx(pid, delta);
  },
  pulse(i) {
    emit({ t: 'pulse', i });
    if (S().fx) pulseTile(i);
  },
  async flash(i) {
    emit({ t: 'flash', i });
    markChosen(i, true);
    try {
      await sleep(S().bot);
    } finally {
      markChosen(i, false);
    }
  },
  toast(html, kind = 'info', ms = 2600) {
    emit({ t: 'toast', html, kind, ms });
    toast(html, kind, ms);
  },
  sound(name) {
    emit({ t: 'sound', name });
    Sound.play(name);
  },
  async card(pid, id) {
    emit({ t: 'card', pid, id });
    if (cardShownHere(pid)) {
      const shown = chanceDialog(P(pid), id);
      if (isBot(P(pid))) await shown;
      else shown.catch(() => {});
    }
  },
  timer(pid, ms) {
    emit({ t: 'timer', pid, ms });
    setTimer(pid, ms);
  },
  gameOver(fresh) {
    emit({ t: 'gameover' });
    gameOverDialog(fresh);
  },
  bankruptNotice(pid) {
    emit({ t: 'bankrupt', pid });
    if (store.role !== 'guest' && bankruptIsMine(pid)) bankruptNotice(store.role === 'local' && onlyBotsOrRemoteLeft());
  },
  emote(pid, emoji) {
    emit({ t: 'emote', pid, emoji });
    playerEmote(pid, emoji);
    Sound.play('emote');
  },
  chat(pid, text) {
    emit({ t: 'chat', pid, text });
    addChatMessage(pid, text);
  },
};

/** Máy khách: hiển thị một sự kiện nhận từ chủ phòng (không chờ hoạt ảnh) */
export function applyEvent(ev) {
  const s = store.state;
  if (!s || !ev || typeof ev.t !== 'string') return;
  const validPid = (pid) => Number.isInteger(pid) && pid >= 0 && pid < s.players.length;
  const validTile = (i) => Number.isInteger(i) && i >= 0 && i < TILE_COUNT;
  switch (ev.t) {
    case 'status':
      setStatus(sanitizeHTML(ev.html));
      break;
    case 'clear':
      clearActions();
      break;
    case 'banner':
      if (validPid(ev.pid)) banner(P(ev.pid), bannerSub(ev.pid, ev.sub ? sanitizeHTML(ev.sub) : null)).catch(() => {});
      break;
    case 'dice':
      if (Array.isArray(ev.d) && ev.d.every((v) => Number.isInteger(v) && v >= 1 && v <= 6)) {
        s.lastRoll = ev.d;
        startDiceRoll(ev.d[0], ev.d[1]);
        setTimeout(() => finishDiceRoll(ev.d[0], ev.d[1]), S().dice);
      }
      break;
    case 'step':
      if (validPid(ev.pid) && validTile(ev.pos)) {
        P(ev.pid).pos = ev.pos;
        layoutTokens();
        hopToken(ev.pid);
        Sound.play('step');
      }
      break;
    case 'fly':
      if (validPid(ev.pid) && validTile(ev.pos)) {
        P(ev.pid).pos = ev.pos;
        flyToken(ev.pid, !!ev.on);
      }
      break;
    case 'tileFx':
      if (validTile(ev.i)) tileFx(ev.i, sanitizeHTML(ev.html), String(ev.kind || '').replace(/[^\w\s-]/g, ''));
      break;
    case 'money':
      if (validPid(ev.pid) && Number.isFinite(ev.delta)) playerMoneyFx(ev.pid, ev.delta);
      break;
    case 'pulse':
      if (validTile(ev.i) && S().fx) pulseTile(ev.i);
      break;
    case 'flash':
      if (validTile(ev.i)) {
        markChosen(ev.i, true);
        setTimeout(() => markChosen(ev.i, false), Math.max(S().bot, 300));
      }
      break;
    case 'toast':
      toast(sanitizeHTML(ev.html), String(ev.kind || 'info').replace(/\W/g, ''), Math.min(Number(ev.ms) || 2600, 8000));
      break;
    case 'sound':
      Sound.play(String(ev.name));
      break;
    case 'card':
      if (validPid(ev.pid) && CARD_BY_ID[ev.id] && cardShownHere(ev.pid)) chanceDialog(P(ev.pid), ev.id).catch(() => {});
      break;
    case 'timer':
      setTimer(validPid(ev.pid) ? ev.pid : null, Number(ev.ms) || 0);
      break;
    case 'gameover':
      gameOverDialog(true);
      break;
    case 'bankrupt':
      if (validPid(ev.pid) && bankruptIsMine(ev.pid)) bankruptNotice(false);
      break;
    case 'chat': {
      const text = cleanChatText(ev.text);
      if (validPid(ev.pid) && text) addChatMessage(ev.pid, text);
      break;
    }
    case 'emote':
      if (validPid(ev.pid)) {
        playerEmote(ev.pid, String(ev.emoji).slice(0, 4));
        Sound.play('emote');
      }
      break;
    default:
      break;
  }
}

/** Vẽ lại toàn bộ từ trạng thái hiện tại (dùng sau khi nhận ảnh chụp trạng thái) */
export function renderFromState({ dice = false } = {}) {
  renderAll();
  renderLog();
  if (dice && store.state) setDiceFaces(store.state.lastRoll || [5, 2], false);
}
