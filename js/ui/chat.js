/**
 * Khung trò chuyện khi chơi trực tuyến: danh sách tin nhắn, ô nhập, câu nói nhanh,
 * số tin chưa đọc trên nút thanh công cụ và bong bóng lời nói trên thẻ người chơi.
 * Tin nhắn chỉ hiển thị bằng textContent (không bao giờ chèn HTML từ người khác).
 */
import { CHAT_MAX_LEN, CHAT_HISTORY, CHAT_INTERVAL_MS, QUICK_CHATS } from '../config.js';
import { store } from '../core/store.js';
import { $, el } from './dom.js';
import { panelOf } from './hud.js';
import { Sound } from './audio.js';
import { toast } from './fx.js';

let sendHandler = () => {};
let unread = 0;
let lastSent = 0;
let lastWarn = 0;

/** Chuẩn hóa nội dung tin nhắn: gộp khoảng trắng, cắt độ dài; rỗng thì trả '' */
export const cleanChatText = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_LEN);

export const isChatOpen = () => !$('#chat-panel').classList.contains('hidden');

function setUnread(n) {
  unread = n;
  const badge = $('#tb-chat .tb-badge');
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('hidden', n === 0);
}

export function toggleChat(force) {
  const panel = $('#chat-panel');
  const show = force != null ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !show);
  if (show) {
    setUnread(0);
    const list = $('#chat-list');
    list.scrollTop = list.scrollHeight;
    // Điện thoại: không tự bật bàn phím che mất màn hình
    if (window.matchMedia('(pointer: fine)').matches) $('#chat-input').focus();
  }
}

/**
 * Gửi nội dung (từ ô nhập hoặc câu nói nhanh) qua hàm do main.js đăng ký.
 * Gửi quá nhanh thì chủ phòng sẽ bỏ qua, nên chặn ngay tại đây và báo cho người gửi.
 * Trả về true nếu đã gửi.
 */
function submit(text) {
  const clean = cleanChatText(text);
  if (!clean) return false;
  const now = Date.now();
  if (now - lastSent < CHAT_INTERVAL_MS + 150) {
    if (now - lastWarn > 1500) {
      lastWarn = now;
      toast('⏳ Gửi chậm lại một chút nhé', 'info', 1400);
    }
    return false;
  }
  lastSent = now;
  sendHandler(clean);
  return true;
}

export function initChat(onSend) {
  sendHandler = onSend;
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    if (submit(input.value)) input.value = '';
  });
  $('#chat-panel .chat-close').addEventListener('click', () => toggleChat(false));
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleChat(false);
  });
  const quick = $('#chat-quick');
  QUICK_CHATS.forEach((q) => {
    const b = el('button', 'chat-chip');
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', () => submit(q));
    quick.appendChild(b);
  });
}

/** Bong bóng lời nói trên thẻ người chơi (tự biến mất) */
function speechBubble(pid, text) {
  const card = panelOf(pid);
  if (!card) return;
  card.querySelectorAll('.chat-bubble').forEach((b) => b.remove());
  const b = el('div', 'chat-bubble');
  b.textContent = text.length > 60 ? `${text.slice(0, 58)}…` : text;
  card.appendChild(b);
  setTimeout(() => b.remove(), 4500);
}

/** Thêm một tin nhắn của người chơi pid vào khung chat */
export function addChatMessage(pid, text) {
  const s = store.state;
  const p = s && s.players[pid];
  if (!p) return;
  const list = $('#chat-list');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const li = el('li', 'chat-msg');
  li.style.setProperty('--pc', p.color);
  const mine = store.role !== 'local' && pid === store.myId;
  li.classList.toggle('mine', mine);
  const who = el('span', 'chat-who');
  who.textContent = `${p.avatar} ${mine ? 'Bạn' : p.name}`;
  const body = el('span', 'chat-text');
  body.textContent = text;
  li.append(who, body);
  list.appendChild(li);
  while (list.children.length > CHAT_HISTORY) list.firstElementChild.remove();
  if (atBottom || mine) list.scrollTop = list.scrollHeight;
  speechBubble(pid, text);
  if (!mine) {
    Sound.play('emote');
    if (!isChatOpen()) setUnread(unread + 1);
  }
}

/** Xóa lịch sử chat (khi rời phòng / vào phòng mới) */
export function resetChat() {
  $('#chat-list').innerHTML = '';
  $('#chat-input').value = '';
  setUnread(0);
  toggleChat(false);
}
