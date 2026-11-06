/**
 * Kho trạng thái dùng chung + lưu/khôi phục bằng localStorage.
 *  - store.state : trạng thái ván (máy chủ/chơi một máy: bản gốc; máy khách: bản sao đồng bộ)
 *  - store.role  : 'local' | 'host' | 'guest'
 *  - store.myId  : id người chơi của máy này khi chơi trực tuyến
 */
import { SETTINGS_KEY, SAVE_KEY, SAVE_VERSION, TILE_COUNT, SPEEDS, NET_KEY, AVATARS } from '../config.js';

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}
function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* localStorage có thể bị chặn (chế độ riêng tư) — bỏ qua */
  }
}

function loadSettings() {
  const d = { sound: true, speed: 'normal', view: 'auto', setup: null, profile: { name: '', avatar: '🦊' } };
  const s = readJSON(SETTINGS_KEY);
  if (s && typeof s === 'object') {
    if (typeof s.sound === 'boolean') d.sound = s.sound;
    if (SPEEDS[s.speed]) d.speed = s.speed;
    if (['auto', '3d', '2d'].includes(s.view)) d.view = s.view;
    if (s.setup && Array.isArray(s.setup.slots) && s.setup.slots.length === 4) d.setup = s.setup;
    if (s.profile && typeof s.profile.name === 'string') d.profile.name = s.profile.name.slice(0, 14);
    if (s.profile && AVATARS.includes(s.profile.avatar)) d.profile.avatar = s.profile.avatar;
  }
  return d;
}

export const store = {
  state: null,
  role: 'local',
  myId: null,
  settings: loadSettings(),
};

/** Thông số tốc độ hiện hành. Máy khách dùng tốc độ do chủ phòng chọn. */
export function S() {
  const key = store.role === 'guest' ? (store.state && store.state.speed) || 'normal' : store.settings.speed;
  return SPEEDS[key] || SPEEDS.normal;
}

export function saveSettings() {
  writeJSON(SETTINGS_KEY, store.settings);
}

export function saveGame() {
  if (!store.state || store.role === 'guest') return;
  writeJSON(SAVE_KEY, store.state);
}

export function loadGame() {
  const s = readJSON(SAVE_KEY);
  if (!s || s.v !== SAVE_VERSION) return null;
  if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 4) return null;
  if (!Array.isArray(s.props) || s.props.length !== TILE_COUNT) return null;
  if (typeof s.seed !== 'number' || !s.festival) return null;
  return s;
}

export function clearSave() {
  writeJSON(SAVE_KEY, null);
}

/** Thông tin để máy khách kết nối lại phòng (mã phòng, token) */
export function loadNetInfo() {
  const n = readJSON(NET_KEY);
  if (!n || typeof n.code !== 'string' || typeof n.token !== 'string') return null;
  return n;
}
export function saveNetInfo(info) {
  writeJSON(NET_KEY, info);
}
export function clearNetInfo() {
  writeJSON(NET_KEY, null);
}
