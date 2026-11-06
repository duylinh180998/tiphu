/**
 * Kết nối ngang hàng (WebRTC) qua thư viện PeerJS — không cần máy chủ riêng.
 * Máy chủ tín hiệu mặc định là PeerJS Cloud; có thể dùng máy chủ riêng qua tham số URL:
 *   ?peer=may-chu.vn:9000&peerpath=/myapp&peersecure=1
 */
import { PEERJS_URL, ROOM_PREFIX, ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from '../config.js';
import { randomCode } from '../core/util.js';

let loading = null;

export function loadPeerJS() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PEERJS_URL;
    s.async = true;
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('Không tải được thư viện PeerJS.')));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Không tải được thư viện kết nối (PeerJS). Hãy kiểm tra Internet.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function peerOptions() {
  const q = new URLSearchParams(window.location.search);
  const opt = { debug: 1 };
  const host = q.get('peer');
  if (host) {
    const [h, port] = host.split(':');
    opt.host = h;
    if (port) opt.port = Number(port);
    opt.path = q.get('peerpath') || '/';
    opt.secure = q.has('peersecure') ? q.get('peersecure') === '1' : window.location.protocol === 'https:';
  }
  return opt;
}

export const roomPeerId = (code) => `${ROOM_PREFIX}${String(code).toLowerCase()}`;
export const newRoomCode = () => randomCode(ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET);
export const normalizeCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);

const errMessage = (err) => {
  const type = err && err.type;
  if (type === 'unavailable-id') return 'Mã phòng đang được dùng.';
  if (type === 'peer-unavailable') return 'Không tìm thấy phòng — kiểm tra lại mã phòng.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Không kết nối được máy chủ tín hiệu. Hãy thử lại sau.';
  if (type === 'browser-incompatible') return 'Trình duyệt không hỗ trợ WebRTC.';
  return (err && err.message) || 'Lỗi kết nối.';
};

/** Mở một Peer (id cố định cho chủ phòng, ngẫu nhiên cho người vào phòng) */
export function openPeer(id) {
  return new Promise((resolve, reject) => {
    const Peer = window.Peer;
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.off('open', onOpen);
      peer.off('error', onErr);
      if (err) {
        try {
          peer.destroy();
        } catch (e) {
          /* đã đóng */
        }
        const e2 = new Error(errMessage(err));
        e2.type = err.type;
        reject(e2);
      } else {
        resolve(peer);
      }
    };
    const onOpen = () => finish(null);
    const onErr = (err) => finish(err || new Error('Lỗi kết nối.'));
    const timer = setTimeout(() => finish({ type: 'network', message: 'Hết thời gian kết nối máy chủ tín hiệu.' }), 15000);
    peer.on('open', onOpen);
    peer.on('error', onErr);
  });
}

/** Chủ phòng mở peer với mã phòng; thử lại mã cũ vài lần (khi tải lại trang) rồi mới đổi mã mới */
export async function openHostPeer(preferredCode) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const usePreferred = preferredCode && attempt < 5;
    const code = usePreferred ? preferredCode : newRoomCode();
    try {
      const peer = await openPeer(roomPeerId(code));
      return { peer, code };
    } catch (e) {
      if (e.type !== 'unavailable-id') throw e;
      if (usePreferred) await new Promise((r) => setTimeout(r, 2500));
    }
  }
  throw new Error('Không tạo được phòng, hãy thử lại.');
}

/** Mở kết nối dữ liệu tới chủ phòng */
export function connectTo(peer, code) {
  return new Promise((resolve, reject) => {
    let done = false;
    const conn = peer.connect(roomPeerId(code), { reliable: true, serialization: 'json' });
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.off('error', onPeerErr);
      if (err) {
        try {
          conn.close();
        } catch (e) {
          /* đã đóng */
        }
        reject(new Error(errMessage(err)));
      } else {
        resolve(conn);
      }
    };
    const onPeerErr = (err) => {
      if (err && (err.type === 'peer-unavailable' || err.type === 'network' || err.type === 'server-error')) finish(err);
    };
    const timer = setTimeout(
      () => finish({ type: 'timeout', message: 'Hết thời gian kết nối tới phòng. Mạng của bạn có thể chặn kết nối ngang hàng (WebRTC).' }),
      15000
    );
    conn.on('open', () => finish(null));
    conn.on('error', (err) => finish(err));
    peer.on('error', onPeerErr);
  });
}
