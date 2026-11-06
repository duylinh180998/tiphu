/**
 * CỜ TỶ PHÚ — điểm khởi động.
 * Nối các module: giao diện ⇄ engine ⇄ mạng; điều hướng menu, chơi một máy, chơi trực tuyến.
 */
import { SPEEDS, SPEED_ORDER, EMOTES } from './config.js';
import { store, saveSettings, loadGame, S } from './core/store.js';
import { resetSession } from './core/session.js';
import { onBus } from './core/bus.js';
import { esc } from './core/util.js';
import { startNewGame, runLoop, log } from './game/engine.js';
import { setLocalAsker, setDecisionHooks } from './game/players.js';
import { cacheDom, dom, $, $$, el } from './ui/dom.js';
import { buildBoard, renderTiles } from './ui/board3d.js';
import { buildTokens } from './ui/tokens.js';
import { buildDice, setDiceFaces } from './ui/dice.js';
import { buildPanels, setPanelClick, clearActions, setStatus, setTimer } from './ui/hud.js';
import { onTileClick, onTileEnter, onTileLeave, hideTooltip, clearSelectMode } from './ui/select.js';
import { closeAllModals, showPlayerInfo, logModal, rulesModal, confirmDialog, openModal, gameOverDialog } from './ui/dialogs.js';
import { localAsk } from './ui/ask.js';
import { cancelPrompt } from './ui/prompt.js';
import { view, renderFromState } from './ui/view.js';
import { toast } from './ui/fx.js';
import { Sound } from './ui/audio.js';
import { updateLayout } from './ui/layout.js';
import { initScreens, showMenu, hideScreens, renderLobby, showOnline, setOnlineMessage } from './ui/screens.js';
import * as host from './net/host.js';
import * as guest from './net/guest.js';
import { normalizeCode } from './net/peer.js';

const online = () => host.isHosting() || guest.isGuest();

// ===================================================================
// Gắn / gỡ ván đấu khỏi giao diện
// ===================================================================
function clearTransient() {
  cancelPrompt();
  closeAllModals();
  clearSelectMode();
  clearActions();
  setStatus('');
  setTimer(null, 0);
  hideTooltip();
  $$('.turn-banner, .fx-anchor').forEach((e) => e.remove());
  $$('.tile.chosen, .tile.pulse').forEach((e) => e.classList.remove('chosen', 'pulse'));
  if (dom.toasts) dom.toasts.innerHTML = '';
}

function mountGame() {
  buildPanels();
  document.body.classList.add('in-game');
  document.body.classList.toggle('is-online', store.role !== 'local');
  hideScreens();
  updateLayout(true);
  buildTokens();
  renderFromState({ dice: true });
  setStatus('');
  clearActions();
  updateToolbar();
}

function stopGame() {
  resetSession();
  clearTransient();
}

// ===================================================================
// Chơi một máy
// ===================================================================
function startLocal(cfg) {
  leaveOnlineSilently();
  stopGame();
  store.role = 'local';
  store.myId = null;
  startNewGame(cfg);
  mountGame();
  runLoop();
}

async function resumeSaved() {
  const saved = loadGame();
  if (!saved) {
    showMenu();
    return;
  }
  leaveOnlineSilently();
  stopGame();
  store.state = saved;
  if (saved.online && saved.status === 'playing') {
    store.role = 'host';
    store.myId = 0;
    mountGame();
    setStatus('🌐 Đang mở lại phòng…');
    try {
      const code = await host.reopenRoom();
      toast(`🌐 Đã mở lại phòng <b>${esc(code)}</b> — bạn bè sẽ tự kết nối lại`, 'good', 4000);
      view.sync();
      runLoop();
    } catch (e) {
      store.role = 'local';
      toast(`⚠️ ${esc(e.message)}`, 'bad', 5000);
      showMenu();
    }
    return;
  }
  store.role = 'local';
  store.myId = null;
  mountGame();
  if (saved.status === 'playing') runLoop();
  else gameOverDialog(false);
}

// ===================================================================
// Chơi trực tuyến
// ===================================================================
async function createRoom(profile) {
  leaveOnlineSilently();
  await host.createRoom(profile, { startMoney: 2000, maxRounds: 0 });
}

async function joinRoom(code, profile) {
  leaveOnlineSilently();
  await guest.joinRoom(code, profile);
  setOnlineMessage('✅ Đã kết nối — đang chờ chủ phòng…', 'ok');
}

function startOnline() {
  const err = host.startOnlineGame();
  if (err) {
    toast(`⚠️ ${esc(err)}`, 'bad', 3500);
    return;
  }
  clearTransient();
  mountGame();
  runLoop();
}

function leaveOnlineSilently() {
  if (host.isHosting()) host.closeRoom();
  if (guest.isGuest()) guest.leaveRoom();
}

async function leaveOnline({ ask = true } = {}) {
  const inGame = document.body.classList.contains('in-game') && store.state && store.state.status === 'playing';
  if (ask && inGame) {
    const ok = await confirmDialog({
      icon: '🚪',
      title: host.isHosting() ? 'Đóng phòng?' : 'Rời phòng?',
      html: host.isHosting()
        ? '<p>Mọi người trong phòng sẽ bị ngắt kết nối. Ván đấu vẫn được lưu — bạn có thể mở lại phòng từ menu.</p>'
        : '<p>Máy sẽ tạm chơi thay bạn. Bạn có thể kết nối lại phòng từ menu.</p>',
      yes: host.isHosting() ? 'Đóng phòng' : 'Rời phòng',
      no: 'Ở lại',
      danger: true,
    });
    if (!ok) return;
  }
  leaveOnlineSilently();
  stopGame();
  store.role = 'local';
  store.myId = null;
  document.body.classList.remove('in-game', 'is-online');
  updateToolbar();
  showMenu();
}

// ===================================================================
// Thanh công cụ, biểu cảm, phím tắt
// ===================================================================
function updateToolbar() {
  $('#tb-sound .tb-ico').textContent = store.settings.sound ? '🔊' : '🔇';
  $('#tb-speed .tb-label').textContent = S().label;
  $('#tb-view .tb-ico').textContent = document.body.classList.contains('view-3d') ? '🧊' : '▦';
  $('#tb-view .tb-label').textContent = document.body.classList.contains('view-3d') ? '3D' : '2D';
  $('#tb-emote').classList.toggle('hidden', !(online() && document.body.classList.contains('in-game')));
  const root = document.documentElement.style;
  const sp = S();
  root.setProperty('--step-ms', `${sp.step}ms`);
  root.setProperty('--fly-ms', `${sp.fly}ms`);
  root.setProperty('--dice-ms', `${sp.dice}ms`);
}

function toggleEmotePicker(force) {
  const picker = $('#emote-picker');
  const show = force != null ? force : picker.classList.contains('hidden');
  picker.classList.toggle('hidden', !show);
}

function sendEmote(e) {
  toggleEmotePicker(false);
  if (host.isHosting()) host.hostEmote(e);
  else if (guest.isGuest()) guest.sendEmote(e);
}

function bindToolbar() {
  $('#tb-sound').addEventListener('click', () => {
    store.settings.sound = !store.settings.sound;
    saveSettings();
    Sound.setEnabled(store.settings.sound);
    if (store.settings.sound) {
      Sound.unlock();
      Sound.play('coin');
    }
    updateToolbar();
  });
  $('#tb-speed').addEventListener('click', () => {
    if (store.role === 'guest') {
      toast('⏩ Tốc độ do chủ phòng quyết định', 'info', 1800);
      return;
    }
    const k = SPEED_ORDER.indexOf(store.settings.speed);
    store.settings.speed = SPEED_ORDER[(k + 1) % SPEED_ORDER.length];
    saveSettings();
    updateToolbar();
    Sound.play('click');
    toast(`⏩ Tốc độ: <b>${SPEEDS[store.settings.speed].label}</b>`, 'info', 1400);
    if (store.role === 'host' && store.state) view.sync();
  });
  $('#tb-view').addEventListener('click', () => {
    const is3d = document.body.classList.contains('view-3d');
    store.settings.view = is3d ? '2d' : '3d';
    saveSettings();
    updateLayout();
    updateToolbar();
    Sound.play('click');
  });
  $('#tb-log').addEventListener('click', logModal);
  $('#tb-rules').addEventListener('click', rulesModal);
  $('#tb-emote').addEventListener('click', () => toggleEmotePicker());
  $('#tb-menu').addEventListener('click', () => {
    Sound.play('click');
    if (online()) leaveOnline();
    else {
      stopGame();
      document.body.classList.remove('in-game');
      showMenu();
    }
  });
  const logTitle = $('#log-panel .log-title');
  const setLogCollapsed = (on) => {
    dom.logPanel.classList.toggle('collapsed', on);
    $('#log-panel .log-toggle').textContent = on ? '▸' : '▾';
  };
  logTitle.addEventListener('click', () => setLogCollapsed(!dom.logPanel.classList.contains('collapsed')));
  setLogCollapsed(window.innerHeight < 700);
  const picker = $('#emote-picker');
  EMOTES.forEach((e) => {
    const b = el('button', 'emote-btn', e);
    b.type = 'button';
    b.addEventListener('click', () => sendEmote(e));
    picker.appendChild(b);
  });
  $('#room-pill').addEventListener('click', () => {
    const code = host.hostRoomCode() || guest.guestRoomCode();
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(link).then(
      () => toast('🔗 Đã sao chép đường link mời', 'good', 1600),
      () => toast(`Link mời: <b>${esc(link)}</b>`, 'info', 4000)
    );
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'Enter') {
      const modals = $$('#modal-root .modal-backdrop:not(.closing):not(.passive)');
      if (!modals.length && document.body.classList.contains('screen-open')) return;
      const btn = modals.length ? modals[modals.length - 1].querySelector('[data-hotkey]') : dom.actions.querySelector('[data-hotkey]');
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    } else if (e.key === 'Escape') {
      hideTooltip();
      toggleEmotePicker(false);
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tile') && !e.target.closest('#tooltip')) hideTooltip();
    if (!e.target.closest('#emote-picker') && !e.target.closest('#tb-emote')) toggleEmotePicker(false);
  });
  document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });
}

// ===================================================================
// Sự kiện mạng & điều hướng
// ===================================================================
function bindBus() {
  onBus('net:lobby', (info) => {
    if (!document.body.classList.contains('in-game')) renderLobby(info);
  });
  onBus('net:start', () => {
    stopGame();
    mountGame();
    Sound.play('join');
    toast('🎲 Ván đấu bắt đầu!', 'good', 2000);
  });
  onBus('net:closed', (msg) => {
    stopGame();
    document.body.classList.remove('in-game', 'is-online');
    $('#net-banner').classList.add('hidden');
    updateToolbar();
    showMenu();
    openModal({ icon: '🔌', title: 'Đã rời phòng', html: `<p>${esc(msg)}</p>`, buttons: [{ label: 'OK', value: true, style: 'primary', hotkey: true }] }).catch(() => {});
  });
  onBus('net:status', ({ lost, attempt }) => {
    const b = $('#net-banner');
    b.classList.toggle('hidden', !lost);
    if (lost) b.innerHTML = `📡 Mất kết nối với chủ phòng — đang thử kết nối lại${attempt ? ` (lần ${attempt})` : ''}<span class="dots"></span>`;
    else toast('📡 Đã kết nối lại!', 'good', 1800);
  });
  onBus('app:menu', () => {
    if (online()) leaveOnline({ ask: false });
    else {
      stopGame();
      document.body.classList.remove('in-game');
      showMenu();
    }
  });
}

function welcomeBack(saved) {
  store.state = saved;
  store.role = saved.online ? 'host' : 'local';
  store.myId = saved.online ? 0 : null;
  mountGame();
  store.role = 'local';
  const cur = saved.players[saved.current];
  const room = saved.online ? `<p>🌐 Đây là ván <b>trực tuyến</b> (phòng ${esc(saved.online.code)}). Mở lại phòng để bạn bè tự kết nối lại.</p>` : '';
  openModal({
    icon: '💾',
    title: 'Chào mừng trở lại!',
    html: `<p>Ván đấu của bạn đã được <b>tự động khôi phục</b> từ trình duyệt.</p><p>Đang ở <b>Vòng ${saved.round}</b>, tới lượt <b style="color:${esc(cur.color)}">${esc(cur.name)}</b>.</p>${room}`,
    buttons: [
      { label: '🏠 Menu', value: 'menu', style: 'ghost' },
      { label: saved.online ? '🌐 Mở lại phòng' : '▶ Tiếp tục chơi', value: 'go', style: 'primary', hotkey: true },
    ],
  }).then(
    (v) => {
      Sound.unlock();
      if (v === 'go') resumeSaved();
      else {
        document.body.classList.remove('in-game');
        showMenu();
      }
    },
    () => {}
  );
}

function boot() {
  cacheDom();
  buildBoard({ click: onTileClick, enter: onTileEnter, leave: onTileLeave });
  buildDice();
  setDiceFaces([5, 2], false);
  renderTiles();
  setPanelClick(showPlayerInfo);
  setLocalAsker(localAsk, cancelPrompt);
  setDecisionHooks({ status: (h) => view.status(h), timer: (pid, ms) => view.timer(pid, ms), log });
  initScreens({
    startLocal,
    resumeSaved,
    createRoom,
    joinRoom,
    startOnline,
    leaveOnline: () => leaveOnline({ ask: false }),
    cycleSeat: (k) => host.cycleSeat(k),
    setRoomOptions: (o) => host.setRoomOptions(o),
    showRules: rulesModal,
  });
  bindToolbar();
  bindKeyboard();
  bindBus();
  updateLayout();
  updateToolbar();
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      hideTooltip();
      updateLayout();
      updateToolbar();
    });
  });

  const room = normalizeCode(new URLSearchParams(window.location.search).get('room'));
  const saved = loadGame();
  if (room) showOnline(room);
  else if (saved && saved.status === 'playing') welcomeBack(saved);
  else if (saved && saved.status === 'gameover' && !saved.online) {
    store.state = saved;
    mountGame();
    gameOverDialog(false);
  } else showMenu();

  // Điểm truy cập nhỏ để gỡ lỗi từ DevTools
  window.CoTyPhu = {
    get state() {
      return store.state;
    },
    get role() {
      return store.role;
    },
    settings: store.settings,
    newGame: startLocal,
    render() {
      renderFromState();
    },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
