/**
 * Các màn hình ngoài ván đấu: menu chính, thiết lập ván một máy, chơi trực tuyến, phòng chờ.
 */
import { AVATARS, DEFAULT_SLOTS, PLAYER_COLORS, SPEEDS } from '../config.js';
import { store, saveSettings, loadGame, loadNetInfo } from '../core/store.js';
import { esc } from '../core/util.js';
import { $, $$, el } from './dom.js';
import { Sound } from './audio.js';
import { toast } from './fx.js';

let actions = {};
const SCREENS = ['menu', 'local', 'online', 'lobby'];

export function showScreen(name) {
  SCREENS.forEach((n) => $(`#screen-${n}`).classList.toggle('hidden', n !== name));
  document.body.classList.add('screen-open');
}

export function hideScreens() {
  SCREENS.forEach((n) => $(`#screen-${n}`).classList.add('hidden'));
  document.body.classList.remove('screen-open');
}

// ===================================================================
// Menu chính
// ===================================================================
export function showMenu() {
  const saved = loadGame();
  const resume = $('#menu-resume');
  if (saved && saved.status === 'playing') {
    const cur = saved.players[saved.current];
    const online = saved.online ? ` · 🌐 phòng ${esc(saved.online.code)}` : '';
    $('#menu-resume-info').innerHTML = `Vòng ${saved.round} · ${saved.players.length} người chơi${online} · tới lượt <b style="color:${esc(cur.color)}">${esc(cur.name)}</b>`;
    $('#btn-menu-resume').textContent = saved.online ? '▶ Mở lại phòng' : '▶ Tiếp tục';
    resume.classList.remove('hidden');
  } else {
    resume.classList.add('hidden');
  }
  const net = loadNetInfo();
  const fresh = net && Date.now() - (net.at || 0) < 6 * 3600 * 1000;
  $('#menu-rejoin').classList.toggle('hidden', !fresh);
  if (fresh) $('#menu-rejoin-info').innerHTML = `Phòng <b>${esc(net.code)}</b> · tên ${esc(net.name || '')}`;
  showScreen('menu');
}

// ===================================================================
// Thiết lập ván một máy (1 người + máy / Pass & Play / xem máy đấu)
// ===================================================================
const setup = { slots: DEFAULT_SLOTS.map((s) => ({ ...s })), startMoney: 2000, maxRounds: 0 };

function loadSetup() {
  const s = store.settings.setup;
  if (!s) return;
  s.slots.forEach((slot, k) => {
    if (!slot) return;
    if (['human', 'bot', 'off'].includes(slot.type)) setup.slots[k].type = slot.type;
    if (typeof slot.name === 'string') setup.slots[k].name = slot.name.slice(0, 14);
    if (AVATARS.includes(slot.avatar)) setup.slots[k].avatar = slot.avatar;
  });
  if ([1500, 2000, 3000].includes(s.startMoney)) setup.startMoney = s.startMoney;
  if ([0, 20, 30, 50].includes(s.maxRounds)) setup.maxRounds = s.maxRounds;
}

function nextAvatar(current, usedList) {
  const used = new Set(usedList);
  let idx = AVATARS.indexOf(current);
  for (let n = 0; n < AVATARS.length; n++) {
    idx = (idx + 1) % AVATARS.length;
    if (!used.has(AVATARS[idx])) return AVATARS[idx];
  }
  return current;
}

function renderSlots() {
  const wrap = $('#slots');
  wrap.innerHTML = '';
  setup.slots.forEach((s, k) => {
    const c = el('div', `slot${s.type === 'off' ? ' off' : ''}`);
    c.style.setProperty('--pc', PLAYER_COLORS[k]);
    c.innerHTML = `
      <div class="slot-head"><span class="slot-dot"></span>Người chơi ${k + 1}</div>
      <div class="slot-main">
        <button type="button" class="slot-avatar" title="Đổi biểu tượng" aria-label="Đổi biểu tượng người chơi ${k + 1}">${s.avatar}</button>
        <input class="slot-name" maxlength="14" value="${esc(s.name)}" ${s.type === 'off' ? 'disabled' : ''} aria-label="Tên người chơi ${k + 1}" />
      </div>
      <div class="seg" role="group" aria-label="Loại người chơi">
        ${[['human', '👤', 'Người'], ['bot', '🤖', 'Máy'], ['off', '✖', 'Trống']].map(([v, ico, txt]) => `<button type="button" data-t="${v}" class="${s.type === v ? 'on' : ''}"><span class="seg-ico">${ico}</span> <span class="seg-txt">${txt}</span></button>`).join('')}
      </div>`;
    c.querySelector('.slot-avatar').addEventListener('click', () => {
      s.avatar = nextAvatar(s.avatar, setup.slots.filter((x, j) => j !== k).map((x) => x.avatar));
      Sound.play('click');
      renderSlots();
    });
    c.querySelector('.slot-name').addEventListener('input', (e) => {
      s.name = e.target.value;
    });
    c.querySelectorAll('.seg button').forEach((b) =>
      b.addEventListener('click', () => {
        s.type = b.dataset.t;
        Sound.play('click');
        renderSlots();
      })
    );
    wrap.appendChild(c);
  });
  const humans = setup.slots.filter((s) => s.type === 'human').length;
  const active = setup.slots.filter((s) => s.type !== 'off').length;
  let mode;
  if (active < 2) mode = '⚠️ Cần ít nhất 2 người chơi';
  else if (humans >= 2) mode = `🤝 Pass & Play: ${humans} người chơi chung 1 máy${active > humans ? ` + ${active - humans} máy` : ''}`;
  else if (humans === 1) mode = `👤 1 người chơi + ${active - 1} máy`;
  else mode = `👀 Chế độ xem: ${active} máy đấu với nhau`;
  $('#setup-mode').textContent = mode;
}

function applyPreset(name) {
  const map = { solo: ['human', 'bot', 'bot', 'bot'], pp2: ['human', 'human', 'off', 'off'], pp4: ['human', 'human', 'human', 'human'], watch: ['bot', 'bot', 'bot', 'bot'] };
  const types = map[name];
  if (!types) return;
  types.forEach((t, k) => {
    const s = setup.slots[k];
    s.type = t;
    if (t === 'human' && s.name === DEFAULT_SLOTS[k].name && k > 0) s.name = `Người ${k + 1}`;
    if (t === 'bot' && /^Người \d$/.test(s.name)) s.name = DEFAULT_SLOTS[k].name;
  });
  Sound.play('click');
  renderSlots();
}

export function showLocalSetup() {
  loadSetup();
  $('#opt-money').value = String(setup.startMoney);
  $('#opt-rounds').value = String(setup.maxRounds);
  $('#opt-speed').value = store.settings.speed;
  renderSlots();
  showScreen('local');
}

function startLocal() {
  const active = setup.slots.map((s, k) => ({ ...s, k })).filter((s) => s.type !== 'off');
  if (active.length < 2) {
    toast('⚠️ Cần ít nhất 2 người chơi để bắt đầu!', 'bad');
    Sound.play('bad');
    return;
  }
  setup.startMoney = Number($('#opt-money').value) || 2000;
  setup.maxRounds = Number($('#opt-rounds').value) || 0;
  const speed = $('#opt-speed').value;
  store.settings.speed = SPEEDS[speed] ? speed : 'normal';
  store.settings.setup = {
    slots: setup.slots.map((s) => ({ type: s.type, name: s.name, avatar: s.avatar })),
    startMoney: setup.startMoney,
    maxRounds: setup.maxRounds,
  };
  saveSettings();
  actions.startLocal({
    startMoney: setup.startMoney,
    maxRounds: setup.maxRounds,
    players: active.map((s) => ({
      name: (s.name || '').trim().slice(0, 14) || (s.type === 'bot' ? `Máy ${s.k + 1}` : `Người ${s.k + 1}`),
      type: s.type,
      color: PLAYER_COLORS[s.k],
      avatar: s.avatar,
    })),
  });
}

// ===================================================================
// Chơi trực tuyến
// ===================================================================
function profile() {
  const name = ($('#online-name').value || '').trim().slice(0, 14);
  return { name: name || 'Người chơi', avatar: store.settings.profile.avatar };
}

function saveProfile() {
  const p = profile();
  store.settings.profile = p;
  saveSettings();
  return p;
}

export function setOnlineMessage(text, kind = '') {
  const m = $('#online-msg');
  m.className = `online-msg ${kind}`;
  m.innerHTML = text || '';
}

function setOnlineBusy(busy) {
  ['#btn-create-room', '#btn-join-room'].forEach((s) => {
    $(s).disabled = busy;
  });
}

export function showOnline(prefillCode = '') {
  $('#online-name').value = store.settings.profile.name || '';
  $('#online-avatar').textContent = store.settings.profile.avatar;
  if (prefillCode) $('#join-code').value = prefillCode;
  setOnlineMessage('');
  setOnlineBusy(false);
  showScreen('online');
}

async function runOnline(fn, busyText) {
  setOnlineBusy(true);
  setOnlineMessage(`<span class="dots">${busyText}</span>`, 'busy');
  try {
    await fn(saveProfile());
  } catch (e) {
    setOnlineMessage(`⚠️ ${esc(e && e.message ? e.message : e)}`, 'error');
  } finally {
    setOnlineBusy(false);
  }
}

// ===================================================================
// Phòng chờ
// ===================================================================
/** Hiển thị của từng loại ghế; ghế có người dùng tên và biểu tượng của người đó */
const SEAT_VIEW = {
  host: { kind: '👑 Chủ phòng' },
  guest: { kind: '🌐 Người chơi' },
  bot: { avatar: '🤖', name: 'Máy tự chơi', kind: 'Máy chơi ghế này' },
  open: { avatar: '⏳', name: 'Ghế trống', kind: 'Chờ người vào…' },
  closed: { avatar: '✖', name: 'Ghế đóng', kind: 'Không dùng ghế này' },
};

export function renderLobby(info) {
  const { code, seats, options, isHost, you } = info;
  $('#lobby-code').textContent = code;
  const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
  $('#lobby-link').textContent = link;
  $('#lobby-link').dataset.link = link;
  const wrap = $('#lobby-seats');
  wrap.innerHTML = '';
  seats.forEach((s, k) => {
    const c = el('div', `lobby-seat seat-${s.kind}${you === k ? ' you' : ''}`);
    c.style.setProperty('--pc', PLAYER_COLORS[k]);
    const v = SEAT_VIEW[s.kind] || SEAT_VIEW.closed;
    const filled = s.kind === 'host' || s.kind === 'guest';
    c.innerHTML = `
      <div class="ls-avatar">${filled ? esc(s.avatar) : v.avatar}</div>
      <div class="ls-info"><div class="ls-name">${filled ? esc(s.name) : v.name}${you === k ? ' <span class="ls-you">BẠN</span>' : ''}</div><div class="ls-kind">${v.kind}</div></div>`;
    if (isHost && k > 0) {
      const b = el('button', 'btn btn-ghost btn-sm', s.kind === 'guest' ? '🚪 Mời ra' : s.kind === 'open' ? '➕ Thêm máy' : s.kind === 'bot' ? '✖ Đóng ghế' : '⏳ Mở ghế');
      b.type = 'button';
      b.addEventListener('click', () => {
        Sound.play('click');
        actions.cycleSeat(k);
      });
      c.appendChild(b);
    }
    wrap.appendChild(c);
  });
  ['#lobby-money', '#lobby-rounds'].forEach((s) => {
    $(s).disabled = !isHost;
  });
  $('#lobby-money').value = String(options.startMoney || 2000);
  $('#lobby-rounds').value = String(options.maxRounds || 0);
  const players = seats.filter((s) => s.kind === 'host' || s.kind === 'guest' || s.kind === 'bot').length;
  const waiting = seats.filter((s) => s.kind === 'open').length;
  $('#btn-lobby-start').classList.toggle('hidden', !isHost);
  $('#btn-lobby-start').disabled = players < 2;
  $('#lobby-status').textContent = isHost
    ? players < 2
      ? 'Gửi mã phòng cho bạn bè, hoặc thêm máy để bắt đầu.'
      : `${players} người chơi${waiting ? ` · ${waiting} ghế đang chờ (ghế chờ sẽ bị bỏ khi bắt đầu)` : ''} — sẵn sàng!`
    : 'Đang chờ chủ phòng bắt đầu ván đấu…';
  if (!document.body.classList.contains('in-game')) showScreen('lobby');
}

async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'good', 1600);
  } catch (e) {
    toast(`Sao chép thủ công: <b>${esc(text)}</b>`, 'info', 4000);
  }
}

// ===================================================================
// Gắn sự kiện
// ===================================================================
export function initScreens(acts) {
  actions = acts;
  $('#btn-menu-local').addEventListener('click', () => {
    Sound.unlock();
    Sound.play('click');
    showLocalSetup();
  });
  $('#btn-menu-online').addEventListener('click', () => {
    Sound.unlock();
    Sound.play('click');
    showOnline();
  });
  $('#btn-menu-rules').addEventListener('click', () => actions.showRules());
  $('#btn-menu-resume').addEventListener('click', () => {
    Sound.unlock();
    actions.resumeSaved();
  });
  $('#btn-menu-rejoin').addEventListener('click', () => {
    Sound.unlock();
    const net = loadNetInfo();
    if (!net) return;
    store.settings.profile = { name: net.name || store.settings.profile.name, avatar: AVATARS.includes(net.avatar) ? net.avatar : store.settings.profile.avatar };
    showOnline(net.code);
    runOnline((p) => actions.joinRoom(net.code, p), 'Đang kết nối lại phòng');
  });

  $$('[data-preset]').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
  $('#btn-local-back').addEventListener('click', () => showMenu());
  $('#btn-local-start').addEventListener('click', startLocal);
  $('#btn-local-rules').addEventListener('click', () => actions.showRules());

  $('#online-avatar').addEventListener('click', () => {
    store.settings.profile.avatar = nextAvatar(store.settings.profile.avatar, []);
    $('#online-avatar').textContent = store.settings.profile.avatar;
    Sound.play('click');
  });
  $('#btn-online-back').addEventListener('click', () => showMenu());
  $('#btn-create-room').addEventListener('click', () => {
    Sound.unlock();
    runOnline((p) => actions.createRoom(p), 'Đang tạo phòng');
  });
  $('#btn-join-room').addEventListener('click', () => {
    Sound.unlock();
    const code = ($('#join-code').value || '').trim();
    if (code.length < 4) {
      setOnlineMessage('⚠️ Hãy nhập mã phòng (6 ký tự).', 'error');
      return;
    }
    runOnline((p) => actions.joinRoom(code, p), 'Đang vào phòng');
  });
  $('#join-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  $('#join-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-join-room').click();
  });

  $('#btn-copy-code').addEventListener('click', () => copyText($('#lobby-code').textContent, '📋 Đã sao chép mã phòng'));
  $('#btn-copy-link').addEventListener('click', () => copyText($('#lobby-link').dataset.link, '🔗 Đã sao chép đường link mời'));
  $('#btn-lobby-start').addEventListener('click', () => actions.startOnline());
  $('#btn-lobby-leave').addEventListener('click', () => actions.leaveOnline());
  ['#lobby-money', '#lobby-rounds'].forEach((s) =>
    $(s).addEventListener('change', () => actions.setRoomOptions({ startMoney: Number($('#lobby-money').value) || 2000, maxRounds: Number($('#lobby-rounds').value) || 0 }))
  );
}
