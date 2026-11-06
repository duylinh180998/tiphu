/**
 * Điều phối quyết định của người chơi:
 *  - máy (bot)            → AI.decide (kèm thời gian "suy nghĩ")
 *  - người chơi trên máy này → hộp thoại giao diện (localAsker)
 *  - người chơi từ xa      → gửi yêu cầu qua mạng (remoteAsker, do module host đăng ký)
 * Khi chơi trực tuyến, mọi quyết định của người có giới hạn thời gian.
 */
import { DECISION_TIMEOUT_MS, SELL_TIMEOUT_MS } from '../config.js';
import { store, S } from '../core/store.js';
import { sleep, Session, Cancelled } from '../core/session.js';
import { AI } from './ai.js';
import { isBot, isRemote } from './rules.js';
import { pn, tn } from './text.js';

let localAsker = null;
let remoteAsker = null;
let cancelLocal = () => {};
let hooks = { status: () => {}, timer: () => {}, log: () => {} };

export function setLocalAsker(fn, cancelFn) {
  localAsker = fn;
  cancelLocal = cancelFn || (() => {});
}
export function setRemoteAsker(fn) {
  remoteAsker = fn;
}
/** Engine/giao diện đăng ký các hàm hiển thị trạng thái, đồng hồ và nhật ký */
export function setDecisionHooks(h) {
  hooks = { ...hooks, ...h };
}

export const timeoutFor = (kind) => (kind === 'sell' ? SELL_TIMEOUT_MS : DECISION_TIMEOUT_MS);
const TIMEOUT = Symbol('timeout');

function thinkingText(p, kind, d) {
  const who = `🤖 ${pn(p)}`;
  const dots = '<span class="dots"></span>';
  switch (kind) {
    case 'roll':
      return `${who} đang lắc xúc xắc${dots}`;
    case 'island':
      return `${who} đang tính cách rời đảo${dots}`;
    case 'tour':
      return `${who} đang chọn điểm đến${dots}`;
    case 'purchase':
    case 'resort':
      return `${who} đang cân nhắc mua ${tn(d.i)}${dots}`;
    case 'upgrade':
      return `${who} đang tính chuyện nâng cấp ${tn(d.i)}${dots}`;
    case 'buyout':
      return `${who} đang cân nhắc mua đứt ${tn(d.i)}${dots}`;
    case 'select':
      return `${who} đang lựa chọn${dots}`;
    case 'sell':
      return `${who} đang bán tài sản để trả nợ${dots}`;
    default:
      return null;
  }
}

/** Máy suy nghĩ rồi quyết định (cũng dùng khi máy chơi thay người mất kết nối) */
export async function botDecide(p, kind, d) {
  const msg = thinkingText(p, kind, d);
  if (msg) hooks.status(msg);
  if (kind !== 'card' && kind !== 'bankrupt') await sleep(S().bot);
  return AI.decide(p, kind, d);
}

/** Kiểm tra câu trả lời (đặc biệt từ máy khác); không hợp lệ → lựa chọn mặc định an toàn */
export function validate(p, kind, d, v) {
  const props = store.state.props;
  let ok;
  switch (kind) {
    case 'roll':
      ok = v === 'roll' || ((v === 'even' || v === 'odd') && p.parity > 0);
      break;
    case 'island':
      ok = v === 'roll' || (v === 'pay' && !!d.canPay);
      break;
    case 'tour':
      ok = v === null || (Number.isInteger(v) && d.cands.includes(v));
      break;
    case 'purchase':
    case 'upgrade':
      ok = v === 0 || d.options.some((o) => o.level === v && o.cost <= p.money);
      break;
    case 'buyout':
    case 'resort':
      ok = typeof v === 'boolean';
      break;
    case 'select':
      ok = (v === null && !!d.cancelLabel) || (Number.isInteger(v) && d.cands.includes(v));
      break;
    case 'sell':
      ok = Array.isArray(v) && v.length <= 32 && v.every((i) => Number.isInteger(i) && props[i] && props[i].owner === p.id);
      break;
    default:
      return true;
  }
  if (!ok) return AI.timeoutDefault(p, kind, d);
  return kind === 'sell' ? [...new Set(v)] : v;
}

export function onTimeout(p, kind, d) {
  hooks.log(`⏱️ ${pn(p)} hết thời gian suy nghĩ — hệ thống tự chọn.`, 'bad');
  return AI.timeoutDefault(p, kind, d);
}

async function timedLocal(p, kind, d) {
  const ms = timeoutFor(kind);
  hooks.timer(p.id, ms);
  let timer = null;
  const timeout = new Promise((res) => {
    timer = setTimeout(() => res(TIMEOUT), ms);
  });
  try {
    const r = await Promise.race([localAsker(p, kind, d), timeout]);
    if (r === TIMEOUT) {
      cancelLocal();
      return onTimeout(p, kind, d);
    }
    return validate(p, kind, d, r);
  } finally {
    clearTimeout(timer);
    hooks.timer(null, 0);
  }
}

async function route(p, kind, d) {
  if (isBot(p)) return botDecide(p, kind, d);
  if (isRemote(p) && remoteAsker) return remoteAsker(p, kind, d);
  if (store.role === 'host') return timedLocal(p, kind, d);
  return validate(p, kind, d, await localAsker(p, kind, d));
}

/**
 * Hỏi người chơi p một quyết định. kind/data giống nhau cho mọi loại người chơi.
 * Nếu phiên đã đổi trong lúc chờ (ván mới/rời phòng) thì dừng luồng cũ ngay.
 */
export async function ask(p, kind, d = {}) {
  const sid = Session.id;
  const value = await route(p, kind, d);
  if (sid !== Session.id) throw new Cancelled();
  return value;
}
