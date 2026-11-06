/**
 * Vai trò NGƯỜI VÀO PHÒNG: nhận trạng thái/sự kiện từ chủ phòng để hiển thị,
 * trả lời các yêu cầu quyết định, tự kết nối lại khi rớt mạng.
 * Mọi dữ liệu nhận về đều được kiểm tra và lọc HTML trước khi hiển thị.
 */
import { NET_PROTOCOL, HEARTBEAT_TIMEOUT_MS, EMOTES, TILE_COUNT, AVATARS, PLAYER_COLORS } from '../config.js';
import { store, saveNetInfo, loadNetInfo } from '../core/store.js';
import { sanitizeHTML } from '../core/util.js';
import { emitBus } from '../core/bus.js';
import { loadPeerJS, openPeer, connectTo, normalizeCode } from './peer.js';
import { localAsk } from '../ui/ask.js';
import { cancelPrompt } from '../ui/prompt.js';
import { applyEvent, renderFromState } from '../ui/view.js';
import { renderLog } from '../ui/hud.js';

let client = null;

export const isGuest = () => !!client;
export const guestRoomCode = () => (client ? client.code : null);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function send(msg) {
  try {
    if (client && client.conn && client.conn.open) client.conn.send(msg);
  } catch (e) {
    /* kết nối đã đóng */
  }
}

const REJECT_TEXT = {
  full: 'Phòng đã đủ 4 người.',
  started: 'Ván đấu trong phòng đã bắt đầu.',
  version: 'Phiên bản trò chơi của bạn khác chủ phòng — hãy tải lại trang.',
};

export async function joinRoom(code, profile) {
  await loadPeerJS();
  const c = normalizeCode(code);
  const info = loadNetInfo();
  client = {
    code: c,
    profile,
    token: info && info.code === c ? info.token : null,
    peer: null,
    conn: null,
    myId: null,
    inGame: false,
    promptId: null,
    last: Date.now(),
    leaving: false,
    reconnecting: false,
    hb: null,
  };
  try {
    client.peer = await openPeer(null);
    await connect();
  } catch (e) {
    leaveRoom();
    throw e;
  }
  client.hb = setInterval(checkHost, 2000);
  return c;
}

async function connect() {
  const me = client;
  if (me.peer.disconnected && !me.peer.destroyed) me.peer.reconnect();
  const conn = await connectTo(me.peer, me.code);
  if (client !== me || me.leaving) {
    conn.close();
    return;
  }
  me.conn = conn;
  me.last = Date.now();
  conn.on('data', (msg) => onData(conn, msg));
  conn.on('close', () => onLost(conn));
  conn.on('error', () => onLost(conn));
  conn.send({ t: 'hello', v: NET_PROTOCOL, name: me.profile.name, avatar: me.profile.avatar, token: me.token });
}

export function leaveRoom() {
  if (!client) return;
  const c = client;
  client = null;
  c.leaving = true;
  clearInterval(c.hb);
  try {
    if (c.conn && c.conn.open) c.conn.send({ t: 'leave' });
  } catch (e) {
    /* đã đóng */
  }
  setTimeout(() => {
    try {
      if (c.peer) c.peer.destroy();
    } catch (e) {
      /* đã đóng */
    }
  }, 250);
  cancelPrompt();
  if (store.role === 'guest') {
    store.role = 'local';
    store.myId = null;
  }
}

export function sendEmote(emoji) {
  if (client && client.inGame && EMOTES.includes(emoji)) send({ t: 'emote', e: emoji });
}

// ---------- Kiểm tra dữ liệu nhận về ----------
const HEX = /^#[0-9a-f]{6}$/i;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

function cleanState(s) {
  if (!s || !Array.isArray(s.players) || s.players.length < 2 || s.players.length > 4) return null;
  if (!Array.isArray(s.props) || s.props.length !== TILE_COUNT) return null;
  s.players.forEach((p, i) => {
    p.id = i;
    p.name = String(p.name || '').slice(0, 14);
    p.color = HEX.test(p.color) ? p.color : PLAYER_COLORS[i];
    p.avatar = AVATARS.includes(p.avatar) || p.avatar === '🤖' ? p.avatar : '❓';
    if (!int(p.pos, 0, TILE_COUNT - 1)) p.pos = 0;
  });
  s.log = Array.isArray(s.log) ? s.log.slice(0, 160).map(cleanLog) : [];
  if (!s.festival) s.festival = { tile: null, mult: 1, editions: 0 };
  return s;
}

const cleanLog = (e) => ({ r: Number(e && e.r) || 0, h: sanitizeHTML(e && e.h), k: String((e && e.k) || '').replace(/\W/g, '') });

function cleanPromptData(kind, d) {
  if (!d || typeof d !== 'object') return null;
  const out = { ...d };
  if ('title' in out) out.title = sanitizeHTML(out.title);
  if ('cancelLabel' in out) out.cancelLabel = out.cancelLabel ? sanitizeHTML(out.cancelLabel) : null;
  if ('i' in out && !int(out.i, 0, TILE_COUNT - 1)) return null;
  if ('cands' in out) {
    if (!Array.isArray(out.cands)) return null;
    out.cands = out.cands.filter((i) => int(i, 0, TILE_COUNT - 1));
  }
  if ('options' in out) {
    if (!Array.isArray(out.options)) return null;
    out.options = out.options.filter((o) => o && int(o.level, 1, 4) && Number.isFinite(o.cost) && Number.isFinite(o.rent));
  }
  if (kind === 'select' && !['start', 'festival', 'freeUp', 'sellHouse', 'evict'].includes(out.purpose)) out.purpose = 'start';
  return out;
}

// ---------- Nhận tin nhắn ----------
function onData(conn, msg) {
  if (!client || conn !== client.conn || !msg || typeof msg !== 'object') return;
  client.last = Date.now();
  switch (msg.t) {
    case 'welcome':
      client.token = typeof msg.token === 'string' ? msg.token : client.token;
      saveNetInfo({ code: client.code, token: client.token, name: client.profile.name, avatar: client.profile.avatar, at: Date.now() });
      break;
    case 'reject':
      emitBus('net:closed', REJECT_TEXT[msg.reason] || 'Không vào được phòng.');
      leaveRoom();
      break;
    case 'lobby':
      if (!client.inGame) emitBus('net:lobby', { code: client.code, seats: Array.isArray(msg.seats) ? msg.seats.slice(0, 4) : [], options: msg.options || {}, you: msg.you, isHost: false });
      break;
    case 'start': {
      const s = cleanState(msg.state);
      if (!s || !int(msg.myId, 0, s.players.length - 1)) return;
      client.myId = msg.myId;
      client.inGame = true;
      store.role = 'guest';
      store.myId = msg.myId;
      store.state = s;
      emitBus('net:start', { guest: true });
      break;
    }
    case 'state':
      if (client.inGame && store.state && msg.s) {
        const s = cleanState({ ...msg.s, log: [] });
        if (!s) return;
        s.log = store.state.log;
        store.state = s;
        renderFromState();
      }
      break;
    case 'log':
      if (client.inGame && store.state && msg.e) {
        store.state.log.unshift(cleanLog(msg.e));
        if (store.state.log.length > 160) store.state.log.length = 160;
        renderLog();
      }
      break;
    case 'ev':
      if (client.inGame) applyEvent(msg.ev);
      break;
    case 'prompt':
      handlePrompt(msg);
      break;
    case 'cancel':
      if (client.promptId === msg.id) cancelPrompt();
      break;
    case 'ping':
      send({ t: 'pong' });
      break;
    case 'kicked':
      emitBus('net:closed', 'Chủ phòng đã mời bạn ra khỏi phòng.');
      leaveRoom();
      break;
    case 'closed':
      emitBus('net:closed', 'Chủ phòng đã đóng phòng.');
      leaveRoom();
      break;
    default:
      break;
  }
}

async function handlePrompt(msg) {
  if (!client || !client.inGame || !store.state) return;
  const me = store.state.players[client.myId];
  const d = cleanPromptData(msg.kind, msg.data);
  if (!me || !d) return;
  if (client.promptId != null) cancelPrompt();
  const id = msg.id;
  client.promptId = id;
  try {
    const value = await localAsk(me, msg.kind, d);
    if (client && client.promptId === id && value !== undefined) send({ t: 'answer', id, value });
  } catch (e) {
    /* lời nhắc bị hủy */
  } finally {
    if (client && client.promptId === id) client.promptId = null;
  }
}

// ---------- Mất kết nối & kết nối lại ----------
function checkHost() {
  if (!client || !client.conn || client.reconnecting) return;
  if (Date.now() - client.last > HEARTBEAT_TIMEOUT_MS) {
    const conn = client.conn;
    try {
      conn.close();
    } catch (e) {
      /* đã đóng */
    }
    onLost(conn);
  }
}

function onLost(conn) {
  if (!client || client.leaving || conn !== client.conn) return;
  client.conn = null;
  reconnectLoop();
}

async function reconnectLoop() {
  const me = client;
  if (!me || me.reconnecting) return;
  me.reconnecting = true;
  cancelPrompt();
  for (let attempt = 1; attempt <= 40; attempt++) {
    if (client !== me || me.leaving) return;
    emitBus('net:status', { lost: true, attempt });
    await wait(3000);
    if (client !== me || me.leaving) return;
    try {
      if (me.peer.destroyed) me.peer = await openPeer(null);
      await connect();
      me.reconnecting = false;
      emitBus('net:status', { lost: false });
      return;
    } catch (e) {
      /* thử lại */
    }
  }
  if (client === me) {
    emitBus('net:closed', 'Mất kết nối với chủ phòng.');
    leaveRoom();
  }
}
