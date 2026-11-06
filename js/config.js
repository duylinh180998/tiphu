/**
 * Cấu hình & hằng số luật chơi (đơn vị tiền: nghìn đô — K).
 */

export const SAVE_KEY = 'cotyphu.save.v1';
export const SETTINGS_KEY = 'cotyphu.settings.v1';
export const NET_KEY = 'cotyphu.net.v1';
export const SAVE_VERSION = 3; // đổi khi luật/định dạng ván thay đổi: ván lưu cũ bị bỏ qua

// ---------- Bàn cờ ----------
export const TILE_COUNT = 32;
export const START_TILE = 0;
export const ISLAND_TILE = 8;
export const FESTIVAL_TILE = 16;
export const TOUR_TILE = 24;
export const TAX_TILE = 30;

// ---------- Luật chơi ----------
export const START_SALARY = 300;
export const ISLAND_FEE = 200;
export const ISLAND_TURNS = 3;
export const TOUR_FEE = 50;
export const RESORT_PRICE = 200;
export const RESORT_RENTS = [0, 50, 100, 200, 400]; // 4 khu = thắng ngay
export const TAX_RATE = 0.1; // 10% tổng tài sản (tiền mặt + bất động sản)
export const SELL_RATE = 0.5;
export const BUYOUT_RATE = 2;
export const FESTIVAL_MULTS = [2, 3, 4, 5];
export const MONOPOLY_MULT = 2; // sở hữu trọn nhóm màu: tiền thuê cả nhóm x2
/**
 * Mở khóa công trình theo số lần đã qua ô Bắt Đầu:
 * vòng 1 (chưa qua lần nào) chỉ mua Đất nền; vòng 2 mở tới Nhà cấp 2; từ vòng 3 mở Khách sạn.
 */
export const BUILD_CAP_BY_LAP = [1, 3, 4];
export const PARITY_USES = 3; // số lần chọn Chẵn/Lẻ mỗi ván
export const OUTAGE_ROUNDS = 3; // thẻ Mất Điện: số vòng thành phố không thu được thuê
export const COUPON_RATE = 0.5; // thẻ Giảm Giá: trả 50% cho lần mua/xây/mua đứt tiếp theo
export const DEFAULT_ROUNDS = 30;
export const INFLATION_START = 40; // từ vòng 41 tiền thuê bắt đầu tăng
export const INFLATION_STEP = 0.05; // +5% mỗi vòng
export const MAX_LOG = 160;

/** Cấp công trình: 0 chưa có chủ, 1 Đất nền, 2 Nhà cấp 1, 3 Nhà cấp 2, 4 Khách sạn, 5 Biểu Tượng */
export const HOTEL = 4;
export const LANDMARK = 5;
/** Chi phí xây từng cấp và tiền thuê từng cấp, tính theo giá gốc của thành phố */
export const COST_MULT = [0, 0.5, 0.5, 0.5, 0.5, 1];
export const RENT_MULT = [0, 0.1, 0.35, 0.9, 1.75, 3.2];

export const LEVEL_ICONS = ['', '🚩', '🏠', '🏘️', '🏨', '🗼'];
export const LEVEL_NAMES = ['Đất trống', 'Đất nền', 'Nhà cấp 1', 'Nhà cấp 2', 'Khách sạn', 'Biểu Tượng'];

// ---------- Người chơi ----------
export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#ff4d6d', '#3b82f6', '#22c55e', '#facc15'];
export const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐧', '🦁', '🐨', '🐙', '🦄', '🐲', '🐰', '🐻', '🐱', '🐶', '🦉'];
export const DEFAULT_SLOTS = [
  { type: 'human', name: 'Bạn', avatar: '🦊' },
  { type: 'bot', name: 'Minh', avatar: '🐼' },
  { type: 'bot', name: 'Lan', avatar: '🐯' },
  { type: 'bot', name: 'Hùng', avatar: '🐸' },
];
export const BOT_NAMES = ['Minh', 'Lan', 'Hùng', 'Mai', 'Tuấn', 'Vy'];
export const EMOTES = ['👍', '😂', '😱', '😡', '🎉', '🙏'];

// ---------- Tốc độ hoạt ảnh ----------
export const SPEEDS = {
  slow: { label: 'Chậm', step: 300, dice: 1150, bot: 1000, banner: 1200, fly: 950, card: 2100, fx: 1 },
  normal: { label: 'Thường', step: 200, dice: 900, bot: 650, banner: 950, fly: 780, card: 1600, fx: 1 },
  fast: { label: 'Nhanh', step: 110, dice: 600, bot: 320, banner: 650, fly: 540, card: 1000, fx: 1 },
  turbo: { label: 'Siêu tốc', step: 0, dice: 0, bot: 0, banner: 0, fly: 0, card: 0, fx: 0 },
};
export const SPEED_ORDER = ['slow', 'normal', 'fast', 'turbo'];

// ---------- Trực tuyến ----------
export const NET_PROTOCOL = 2; // tăng khi luật hoặc giao thức đổi: máy khác phiên bản bị từ chối kèm lời nhắc tải lại trang
export const ROOM_PREFIX = 'cotyphu-v1-';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
/** STUN công khai: giúp 2 máy tìm địa chỉ của nhau để nối thẳng (miễn phí, không cần tài khoản) */
export const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];
/**
 * TURN (máy chủ chuyển tiếp): cần khi 2 máy ở 2 mạng khác nhau không nối thẳng được
 * (thường gặp với 4G, mạng công ty/trường học). Không bắt buộc: thiếu TURN thì tự dùng kênh chuyển tiếp MQTT.
 * - Cách 1: tạo tài khoản miễn phí "Open Relay" tại metered.ca, dán đường link lấy thông tin TURN
 *   dạng 'https://<ten-app>.metered.live/api/v1/turn/credentials?apiKey=<API_KEY>' vào TURN_CREDENTIALS_URL.
 * - Cách 2: điền trực tiếp máy chủ TURN vào TURN_SERVERS,
 *   ví dụ { urls: 'turn:may-chu.vn:3478', username: 'ten', credential: 'mat-khau' }.
 */
export const TURN_CREDENTIALS_URL = '';
export const TURN_SERVERS = [];
/** Chờ kết nối ngang hàng tối đa bao lâu trước khi chuyển sang kênh chuyển tiếp MQTT */
export const P2P_TIMEOUT_MS = 10000;
export const RELAY_TIMEOUT_MS = 12000;
/**
 * Kênh chuyển tiếp dự phòng (không cần tài khoản): máy chủ MQTT công cộng qua WebSocket bảo mật.
 * Nối song song tới tất cả, dùng máy chủ trả lời nhanh nhất. Có thể thay bằng ?mqtt=url1,url2.
 */
export const RELAY_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://mqtt.eclipseprojects.io:443/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
export const RELAY_TOPIC = 'cotyphu';
export const MQTT_URLS = ['https://cdn.jsdelivr.net/npm/mqtt@5.14.1/dist/mqtt.min.js', 'https://unpkg.com/mqtt@5.14.1/dist/mqtt.min.js'];
export const DECISION_TIMEOUT_MS = 45000; // thời gian suy nghĩ mỗi quyết định khi chơi trực tuyến
export const SELL_TIMEOUT_MS = 75000;
export const DISCONNECT_GRACE_MS = 20000; // chờ người mất kết nối trước khi máy chơi thay
export const HEARTBEAT_MS = 3000;
export const HEARTBEAT_TIMEOUT_MS = 12000;

// ---------- Góc nhìn 3D ----------
export const VIEW_TILT = 57; // độ nghiêng (rotateX)
export const VIEW_SPIN = -45; // xoay bàn cờ thành hình thoi (rotateZ)
