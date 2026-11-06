/**
 * Vai trò CHỦ PHÒNG: giữ trạng thái gốc và chạy engine.
 *  - Phòng chờ: tối đa 4 ghế (chủ phòng, khách, máy, ghế đóng)
 *  - Trong ván: phát sóng ảnh chụp trạng thái + sự kiện hiển thị, hỏi quyết định của khách
 *    (có kiểm tra hợp lệ và giới hạn thời gian), máy chơi thay khi khách mất kết nối.
 */
import {
  NET_PROTOCOL, PLAYER_COLORS, AVATARS, BOT_NAMES, DISCONNECT_GRACE_MS, HEARTBEAT_MS, HEARTBEAT_TIMEOUT_MS, EMOTES,
} from '../config.js';
import { store } from '../core/store.js';
import { sleep, humanWait, resetSession } from '../core/session.js';
import { randomToken, esc } from '../core/util.js';
import { emitBus } from '../core/bus.js';
import { loadPeerJS, openHostPeer } from './peer.js';
import { setRemoteAsker, timeoutFor, validate, onTimeout, botDecide } from '../game/players.js';
import { log, startNewGame } from '../game/engine.js';
import { pn } from '../game/text.js';
import { view, addViewSink } from '../ui/view.js';
import { Sound } from '../ui/audio.js';

let room = null;

export const isHosting = () => !!room;
export const hostRoomCode = () => (room ? room.code : null);

function newRoom(peer, code) {
  return {
    peer,
    code,
    started: false,
    seats: [],
    conns: new Map(),
    options: { startMoney: 2000, maxRounds: 0 },
    promptSeq: 0,
    pending: new Map(),
    pendingSync: false,
    lastSnap: '',
    sinkOff: null,
    hb: null,
    emoteAt: {},
  };
}

const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Khách';

function send(conn, msg) {
  try {
    if (conn && conn.open) conn.send(msg);
  } catch (e) {
    /* kết nối đã đóng */
  }
}

function broadcast(msg) {
  if (!room) return;
  room.conns.forEach((entry, conn) => {
    if (entry.pid != null || (!room.started && entry.seat != null)) send(conn, msg);
  });
}

/** Trạng thái gửi cho máy khách: bỏ token bí mật, kèm tốc độ chủ phòng */
function publicState(withLog) {
  const { secrets, log: entries, ...rest } = store.state;
  const out = { ...rest, speed: store.settings.speed };
  if (withLog) out.log = entries.slice(0, 80);
  return out;
}

function flushSnapshot() {
  if (!room || !room.pendingSync || !store.state) return;
  room.pendingSync = false;
  const obj = publicState(false);
  const str = JSON.stringify(obj);
  if (str === room.lastSnap) return;
  room.lastSnap = str;
  broadcast({ t: 'state', s: obj });
}

function scheduleSnapshot() {
  if (!room || room.pendingSync) return;
  room.pendingSync = true;
  queueMicrotask(flushSnapshot);
}

function installSink() {
  if (room.sinkOff) room.sinkOff();
  room.sinkOff = addViewSink((ev) => {
    if (!room || !room.started) return;
    if (ev.t === 'sync') {
      scheduleSnapshot();
      return;
    }
    flushSnapshot();
    if (ev.t === 'log') broadcast({ t: 'log', e: ev.e });
    else broadcast({ t: 'ev', ev });
  });
  setRemoteAsker(askRemote);
}

// ===================================================================
// Phòng chờ
// ===================================================================
function lobbyInfo() {
  return {
    code: room.code,
    seats: room.seats.map((s) => ({ kind: s.kind, name: s.name || '', avatar: s.avatar || '' })),
    options: { ...room.options },
  };
}

function emitLobby() {
  if (!room || room.started) return;
  const info = lobbyInfo();
  emitBus('net:lobby', { ...info, isHost: true });
  room.conns.forEach((entry, conn) => {
    if (entry.seat != null) send(conn, { t: 'lobby', ...info, you: entry.seat });
  });
}

export async function createRoom(profile, options) {
  await loadPeerJS();
  const { peer, code } = await openHostPeer(null);
  room = newRoom(peer, code);
  room.options = { ...room.options, ...options };
  room.seats = [{ kind: 'host', name: cleanName(profile.name), avatar: profile.avatar }, { kind: 'open' }, { kind: 'open' }, { kind: 'open' }];
  attachPeer();
  emitLobby();
  return code;
}

/** Ghế 1..3: mở → máy → đóng → mở. Ghế có khách: mời ra. */
export function cycleSeat(k) {
  if (!room || room.started || k < 1 || k > 3) return;
  const seat = room.seats[k];
  if (seat.kind === 'guest') {
    kickSeat(k);
    return;
  }
  const next = { open: 'bot', bot: 'closed', closed: 'open' }[seat.kind] || 'open';
  room.seats[k] = { kind: next };
  emitLobby();
}

function kickSeat(k) {
  room.conns.forEach((entry, conn) => {
    if (entry.seat === k) {
      send(conn, { t: 'kicked' });
      entry.seat = null;
      setTimeout(() => {
        try {
          conn.close();
        } catch (e) {
          /* đã đóng */
        }
      }, 300);
    }
  });
  room.seats[k] = { kind: 'open' };
  emitLobby();
}

export function setRoomOptions(opts) {
  if (!room || room.started) return;
  Object.assign(room.options, opts);
  emitLobby();
}

function botAvatarFor(used) {
  return AVATARS.find((a) => !used.has(a)) || '🤖';
}

/** Bắt đầu ván: trả về chuỗi lỗi nếu chưa đủ người, ngược lại null */
export function startOnlineGame() {
  if (!room || room.started) return 'Phòng không hợp lệ.';
  const players = [];
  const tokens = {};
  const used = new Set(room.seats.filter((s) => s.avatar).map((s) => s.avatar));
  room.seats.forEach((seat, k) => {
    if (seat.kind === 'host') {
      seat.pid = players.length;
      players.push({ name: seat.name, type: 'human', color: PLAYER_COLORS[k], avatar: seat.avatar });
    } else if (seat.kind === 'guest') {
      seat.pid = players.length;
      tokens[seat.pid] = seat.token;
      players.push({ name: seat.name, type: 'remote', color: PLAYER_COLORS[k], avatar: seat.avatar });
    } else if (seat.kind === 'bot') {
      const avatar = botAvatarFor(used);
      used.add(avatar);
      seat.pid = players.length;
      players.push({ name: `Máy ${BOT_NAMES[k] || k + 1}`, type: 'bot', color: PLAYER_COLORS[k], avatar });
    } else {
      seat.pid = null;
    }
  });
  if (players.length < 2) return 'Cần ít nhất 2 người chơi — hãy chờ bạn bè vào phòng hoặc thêm máy.';
  resetSession();
  store.role = 'host';
  store.myId = 0;
  startNewGame({ ...room.options, players, online: { code: room.code }, secrets: { tokens } });
  room.started = true;
  room.conns.forEach((entry) => {
    entry.pid = entry.seat != null ? room.seats[entry.seat].pid : null;
  });
  installSink();
  room.conns.forEach((entry, conn) => {
    if (entry.pid != null) send(conn, { t: 'start', myId: entry.pid, state: publicState(true) });
  });
  return null;
}

/** Chủ phòng tải lại trang: mở lại phòng với mã cũ để khách tự kết nối lại */
export async function reopenRoom() {
  const st = store.state;
  await loadPeerJS();
  const { peer, code } = await openHostPeer(st.online.code);
  room = newRoom(peer, code);
  room.started = true;
  st.online.code = code;
  st.players.forEach((p) => {
    if (p.type === 'remote') {
      p.online = false;
      p.offSince = Date.now();
    }
  });
  store.role = 'host';
  store.myId = 0;
  attachPeer();
  installSink();
  return code;
}

export function closeRoom() {
  if (!room) return;
  const r = room;
  room = null;
  r.conns.forEach((entry, conn) => send(conn, { t: 'closed' }));
  clearInterval(r.hb);
  if (r.sinkOff) r.sinkOff();
  setRemoteAsker(null);
  r.pending.forEach((pend) => pend.finish({ disconnected: true }));
  setTimeout(() => {
    try {
      r.peer.destroy();
    } catch (e) {
      /* đã đóng */
    }
  }, 300);
}

// ===================================================================
// Kết nối
// ===================================================================
function attachPeer() {
  const peer = room.peer;
  peer.on('connection', (conn) => {
    room.conns.set(conn, { pid: null, seat: null, last: Date.now() });
    conn.on('data', (msg) => onData(conn, msg));
    conn.on('close', () => onClose(conn));
    conn.on('error', () => onClose(conn));
  });
  peer.on('disconnected', () => {
    if (!room || room.peer !== peer) return;
    try {
      peer.reconnect();
    } catch (e) {
      /* thử lại ở lần sau */
    }
  });
  peer.on('error', (err) => console.warn('[host]', err && err.type, err));
  room.hb = setInterval(heartbeat, HEARTBEAT_MS);
}

function heartbeat() {
  if (!room) return;
  const now = Date.now();
  room.conns.forEach((entry, conn) => {
    if (now - entry.last > HEARTBEAT_TIMEOUT_MS) {
      try {
        conn.close();
      } catch (e) {
        /* đã đóng */
      }
      onClose(conn);
      return;
    }
    send(conn, { t: 'ping' });
  });
}

function onData(conn, msg) {
  if (!room) return;
  const entry = room.conns.get(conn);
  if (!entry || !msg || typeof msg !== 'object') return;
  entry.last = Date.now();
  switch (msg.t) {
    case 'hello':
      onHello(conn, entry, msg);
      break;
    case 'answer':
      onAnswer(entry, msg);
      break;
    case 'emote':
      onEmote(entry, msg);
      break;
    case 'leave':
      try {
        conn.close();
      } catch (e) {
        /* đã đóng */
      }
      onClose(conn);
      break;
    default:
      break;
  }
}

function reject(conn, reason) {
  send(conn, { t: 'reject', reason });
  setTimeout(() => {
    try {
      conn.close();
    } catch (e) {
      /* đã đóng */
    }
  }, 400);
}

function onHello(conn, entry, msg) {
  if (msg.v !== NET_PROTOCOL) {
    reject(conn, 'version');
    return;
  }
  const name = cleanName(msg.name);
  const avatar = AVATARS.includes(msg.avatar) ? msg.avatar : '🐼';
  const token = typeof msg.token === 'string' && /^[0-9a-f]{32}$/.test(msg.token) ? msg.token : null;
  if (room.started) {
    const tokens = (store.state.secrets && store.state.secrets.tokens) || {};
    const pid = token ? Object.keys(tokens).map(Number).find((k) => tokens[k] === token) : undefined;
    if (pid === undefined) {
      reject(conn, 'started');
      return;
    }
    bindPlayer(conn, entry, pid);
    return;
  }
  let k = token ? room.seats.findIndex((s) => s.kind === 'guest' && s.token === token) : -1;
  if (k >= 0) {
    room.conns.forEach((e, c) => {
      if (c !== conn && e.seat === k) {
        e.seat = null;
        try {
          c.close();
        } catch (er) {
          /* đã đóng */
        }
      }
    });
  } else {
    k = room.seats.findIndex((s) => s.kind === 'open');
    if (k < 0) {
      reject(conn, 'full');
      return;
    }
    room.seats[k] = { kind: 'guest', token: randomToken() };
  }
  // Tránh trùng biểu tượng với người khác trong phòng
  const used = new Set(room.seats.filter((s, j) => j !== k && s.avatar).map((s) => s.avatar));
  const finalAvatar = used.has(avatar) ? AVATARS.find((a) => !used.has(a)) || avatar : avatar;
  Object.assign(room.seats[k], { name, avatar: finalAvatar });
  entry.seat = k;
  send(conn, { t: 'welcome', code: room.code, token: room.seats[k].token, seat: k });
  Sound.play('join');
  emitLobby();
}

function bindPlayer(conn, entry, pid) {
  room.conns.forEach((e, c) => {
    if (c !== conn && e.pid === pid) {
      e.pid = null;
      try {
        c.close();
      } catch (er) {
        /* đã đóng */
      }
    }
  });
  entry.pid = pid;
  const p = store.state.players[pid];
  const wasOff = p.online === false;
  p.online = true;
  delete p.offSince;
  delete p.afk;
  send(conn, { t: 'welcome', code: room.code, token: store.state.secrets.tokens[pid], seat: pid });
  send(conn, { t: 'start', myId: pid, state: publicState(true) });
  if (wasOff && store.state.status === 'playing') {
    log(`🔌 ${pn(p)} đã kết nối lại.`, 'good');
    view.toast(`🔌 ${esc(p.name)} đã quay lại!`, 'good');
  }
  Sound.play('join');
  view.sync();
}

function otherConnFor(key, value, except) {
  let found = false;
  room.conns.forEach((e, c) => {
    if (c !== except && e[key] === value) found = true;
  });
  return found;
}

function onClose(conn) {
  if (!room) return;
  const entry = room.conns.get(conn);
  if (!entry) return;
  room.conns.delete(conn);
  if (!room.started) {
    const k = entry.seat;
    if (k != null && room.seats[k] && room.seats[k].kind === 'guest' && !otherConnFor('seat', k, conn)) room.seats[k] = { kind: 'open' };
    emitLobby();
    return;
  }
  if (entry.pid != null && !otherConnFor('pid', entry.pid, conn)) markOffline(entry.pid);
}

function markOffline(pid) {
  const p = store.state && store.state.players[pid];
  if (!p || p.type !== 'remote' || p.online === false) return;
  p.online = false;
  p.offSince = Date.now();
  if (store.state.status === 'playing' && !p.bankrupt) {
    log(`📴 ${pn(p)} mất kết nối — chờ ${DISCONNECT_GRACE_MS / 1000} giây rồi máy sẽ chơi thay.`, 'bad');
    view.toast(`📴 ${esc(p.name)} mất kết nối`, 'warn');
  }
  room.pending.forEach((pend) => {
    if (pend.pid === pid) pend.finish({ disconnected: true });
  });
  view.sync();
}

const connOf = (pid) => {
  let found = null;
  room.conns.forEach((e, c) => {
    if (e.pid === pid && c.open) found = c;
  });
  return found;
};

function onAnswer(entry, msg) {
  const pend = room.pending.get(msg.id);
  if (!pend || pend.pid !== entry.pid) return;
  pend.finish({ value: msg.value });
}

function onEmote(entry, msg) {
  if (!room.started || entry.pid == null || !EMOTES.includes(msg.e)) return;
  const now = Date.now();
  if (now - (room.emoteAt[entry.pid] || 0) < 1200) return;
  room.emoteAt[entry.pid] = now;
  view.emote(entry.pid, msg.e);
}

/** Chủ phòng gửi biểu cảm của chính mình */
export function hostEmote(emoji) {
  if (room && room.started && EMOTES.includes(emoji)) view.emote(store.myId, emoji);
}

// ===================================================================
// Hỏi quyết định của khách
// ===================================================================
async function waitForReconnect(p) {
  const left = DISCONNECT_GRACE_MS - (Date.now() - (p.offSince || 0));
  if (left <= 0) return false;
  view.status(`⏳ Đang chờ ${pn(p)} kết nối lại…`);
  const end = Date.now() + left;
  while (Date.now() < end) {
    await sleep(500);
    if (room && connOf(p.id) && p.online !== false) return true;
  }
  return false;
}

async function askRemote(p, kind, d) {
  if (!room) return botDecide(p, kind, d);
  if (!connOf(p.id) || p.online === false) {
    if (!(await waitForReconnect(p))) {
      if (!p.afk) {
        p.afk = true;
        log(`🤖 Máy tạm chơi thay ${pn(p)} cho tới khi kết nối lại.`);
      }
      return botDecide(p, kind, d);
    }
  }
  const id = ++room.promptSeq;
  const ms = timeoutFor(kind);
  flushSnapshot();
  send(connOf(p.id), { t: 'prompt', id, kind, data: d, ms });
  view.timer(p.id, ms);
  let result;
  try {
    result = await humanWait((done) => {
      const timer = setTimeout(() => finish({ timeout: true }), ms);
      const finish = (r) => {
        clearTimeout(timer);
        if (room) room.pending.delete(id);
        done(r);
      };
      room.pending.set(id, { pid: p.id, finish });
    });
  } finally {
    view.timer(null, 0);
  }
  if (result.timeout) {
    send(connOf(p.id), { t: 'cancel', id });
    return onTimeout(p, kind, d);
  }
  if (result.disconnected) return askRemote(p, kind, d);
  return validate(p, kind, d, result.value);
}
