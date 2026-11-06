/* =========================================================================
 *  CỜ TỶ PHÚ — VÒNG QUANH THẾ GIỚI
 *  Board game kinh doanh 32 ô chạy hoàn toàn trên trình duyệt.
 *  Vanilla JavaScript · Không backend · Tự động lưu ván chơi bằng localStorage.
 *
 *  Cấu trúc file:
 *    1. Hằng số & luật chơi
 *    2. Dữ liệu bàn cờ (32 ô) & thẻ Cơ Hội
 *    3. Tiện ích (định dạng tiền, RNG có seed, hủy tiến trình)
 *    4. Âm thanh (Web Audio API — không cần file mp3)
 *    5. Trạng thái & lưu trữ (localStorage)
 *    6. Truy vấn luật chơi (tiền thuê, giá trị, điều kiện thắng)
 *    7. Engine: vòng lặp lượt chơi & xử lý từng ô
 *    8. AI cho máy (mua đất, nâng cấp, mua lại, bay, bán tài sản)
 *    9. Giao diện: dựng bàn cờ, token, xúc xắc, thẻ người chơi, nhật ký
 *   10. Giao diện: hộp thoại, chọn ô, tooltip, hiệu ứng
 *   11. Màn hình thiết lập, luật chơi, thanh công cụ, khởi động
 * ========================================================================= */
(() => {
  'use strict';

  // ===================================================================
  // 1. HẰNG SỐ & LUẬT CHƠI (đơn vị tiền: nghìn đô — K)
  // ===================================================================
  const SAVE_KEY = 'cotyphu.save.v1';
  const SETTINGS_KEY = 'cotyphu.settings.v1';
  const SAVE_VERSION = 1;

  const TILE_COUNT = 32;
  const START_TILE = 0;
  const ISLAND_TILE = 8;
  const FESTIVAL_TILE = 16;
  const TOUR_TILE = 24;
  const TAX_TILE = 30;

  const START_SALARY = 300;          // đi qua ô Bắt Đầu
  const ISLAND_FEE = 200;            // phí rời Đảo Hoang
  const ISLAND_TURNS = 3;            // số lượt bị giam
  const TOUR_FEE = 50;               // phí Chuyến Bay Thế Giới
  const RESORT_PRICE = 200;          // giá Khu Nghỉ Dưỡng
  const RESORT_RENTS = [0, 50, 100, 200, 400];
  const TAX_RATE = 0.1;              // thuế 10% tiền mặt
  const SELL_RATE = 0.5;             // bán cho ngân hàng nhận 50%
  const BUYOUT_RATE = 2;             // mua lại = gấp đôi giá trị
  const FESTIVAL_MULTS = [2, 3, 4];  // Lễ hội lần 1, 2, 3+ (tối đa x4)
  const MAX_LOG = 160;
  const INFLATION_START = 40;        // từ vòng 41 tiền thuê bắt đầu tăng (chống ván kéo dài vô tận)
  const INFLATION_STEP = 0.05;       // +5% tiền thuê mỗi vòng

  // Chi phí xây từng cấp và tiền thuê từng cấp (tính theo giá gốc của thành phố)
  const COST_MULT = [0, 1, 0.5, 0.5, 1];
  const RENT_MULT = [0, 0.35, 0.9, 1.75, 3.2];

  const LEVEL_ICONS = ['', '🏠', '🏘️', '🏢', '🗼'];
  const LEVEL_NAMES = ['Đất trống', 'Nhà cấp 1', 'Nhà cấp 2', 'Nhà cấp 3', 'Biểu Tượng'];

  const PLAYER_COLORS = ['#ff4d6d', '#3b82f6', '#22c55e', '#facc15'];
  const AVATARS = ['🦊', '🐼', '🐯', '🐸', '🐵', '🐧', '🦁', '🐨', '🐙', '🦄', '🐲', '🐰', '🐻', '🐱', '🐶', '🦉'];
  const DEFAULT_SLOTS = [
    { type: 'human', name: 'Bạn', avatar: '🦊' },
    { type: 'bot', name: 'Minh', avatar: '🐼' },
    { type: 'bot', name: 'Lan', avatar: '🐯' },
    { type: 'bot', name: 'Hùng', avatar: '🐸' },
  ];

  const SPEEDS = {
    slow:   { label: 'Chậm',     step: 300, dice: 1100, bot: 1000, banner: 1200, fly: 950, card: 2100, fx: 1 },
    normal: { label: 'Thường',   step: 190, dice: 850,  bot: 650,  banner: 950,  fly: 750, card: 1600, fx: 1 },
    fast:   { label: 'Nhanh',    step: 105, dice: 560,  bot: 320,  banner: 650,  fly: 520, card: 1000, fx: 1 },
    turbo:  { label: 'Siêu tốc', step: 0,   dice: 0,    bot: 0,    banner: 0,    fly: 0,   card: 0,    fx: 0 },
  };
  const SPEED_ORDER = ['slow', 'normal', 'fast', 'turbo'];

  // ===================================================================
  // 2. DỮ LIỆU BÀN CỜ — 32 ô, chiều kim đồng hồ từ góc dưới trái (ô 0)
  // ===================================================================
  const GROUPS = [
    { name: 'Di Sản Việt', color: '#b45309' },
    { name: 'Đô Thị Việt', color: '#0891b2' },
    { name: 'Đông Nam Á', color: '#db2777' },
    { name: 'Đông Á', color: '#ea580c' },
    { name: 'Trung Đông', color: '#7c3aed' },
    { name: 'Nam Âu', color: '#65a30d' },
    { name: 'Tây Âu', color: '#0d9488' },
    { name: 'Bắc Mỹ', color: '#1e40af' },
  ];

  const TILES = [
    { type: 'start', name: 'BẮT ĐẦU', label: 'BẮT ĐẦU', icon: '🏁', sub: 'Nhận $300K' },
    { type: 'city', name: 'Hội An', group: 0, price: 60 },
    { type: 'city', name: 'Huế', group: 0, price: 60 },
    { type: 'city', name: 'Đà Lạt', group: 0, price: 80 },
    { type: 'resort', name: 'Phú Quốc' },
    { type: 'city', name: 'Hà Nội', group: 1, price: 100 },
    { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
    { type: 'city', name: 'Sài Gòn', group: 1, price: 120 },
    { type: 'island', name: 'ĐẢO HOANG', label: 'ĐẢO HOANG', icon: '🏝️', sub: 'Kẹt 3 lượt' },
    { type: 'city', name: 'Bangkok', group: 2, price: 140 },
    { type: 'city', name: 'Kuala Lumpur', group: 2, price: 140 },
    { type: 'city', name: 'Singapore', group: 2, price: 160 },
    { type: 'resort', name: 'Bali' },
    { type: 'city', name: 'Seoul', group: 3, price: 180 },
    { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
    { type: 'city', name: 'Tokyo', group: 3, price: 200 },
    { type: 'festival', name: 'LỄ HỘI THẾ GIỚI', label: 'LỄ HỘI<br>THẾ GIỚI', icon: '🎉', sub: 'Thuê x2 → x4' },
    { type: 'city', name: 'Cairo', group: 4, price: 220 },
    { type: 'city', name: 'Istanbul', group: 4, price: 220 },
    { type: 'city', name: 'Dubai', group: 4, price: 240 },
    { type: 'resort', name: 'Maldives' },
    { type: 'city', name: 'Rome', group: 5, price: 260 },
    { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
    { type: 'city', name: 'Barcelona', group: 5, price: 280 },
    { type: 'tour', name: 'CHUYẾN BAY THẾ GIỚI', label: 'CHUYẾN BAY<br>THẾ GIỚI', icon: '✈️', sub: 'Bay $50K' },
    { type: 'city', name: 'Amsterdam', group: 6, price: 300 },
    { type: 'city', name: 'Paris', group: 6, price: 300 },
    { type: 'city', name: 'London', group: 6, price: 320 },
    { type: 'resort', name: 'Hawaii' },
    { type: 'city', name: 'Los Angeles', group: 7, price: 350 },
    { type: 'tax', name: 'THUẾ', icon: '💸', sub: '10% tiền mặt' },
    { type: 'city', name: 'New York', group: 7, price: 400 },
  ];

  const r5 = (x) => Math.round(x / 5) * 5;

  TILES.forEach((t, i) => {
    t.i = i;
    if (t.type === 'city') {
      const costs = COST_MULT.map((m) => r5(t.price * m));
      const value = [0];
      for (let L = 1; L <= 4; L++) value[L] = value[L - 1] + costs[L];
      const rents = RENT_MULT.map((m) => r5(t.price * m));
      t.eco = { costs, value, rents };
    }
  });

  const PROP_TILES = TILES.filter((t) => t.type === 'city' || t.type === 'resort').map((t) => t.i);
  const CITY_TILES = TILES.filter((t) => t.type === 'city').map((t) => t.i);
  const RESORT_TILES = TILES.filter((t) => t.type === 'resort').map((t) => t.i);
  const GROUP_TILES = GROUPS.map((g, k) => CITY_TILES.filter((i) => TILES[i].group === k));
  const SIDE_TILES = [0, 1, 2, 3].map((s) => PROP_TILES.filter((i) => i > s * 8 && i < s * 8 + 8));
  const SIDE_NAMES = ['cạnh Việt Nam', 'cạnh Châu Á', 'cạnh Trung Đông & Nam Âu', 'cạnh Tây Âu & Bắc Mỹ'];
  const sideOf = (i) => Math.floor(i / 8);

  const SPECIAL_DESC = {
    start: `Đi qua nhận <b>$300K</b>. Dừng đúng ô này được chọn nâng cấp 1 thành phố đang sở hữu (tối đa Nhà cấp 3).`,
    island: `Dừng tại đây bị kẹt <b>3 lượt</b>. Thoát bằng cách đổ xúc xắc đôi, trả <b>$200K</b> hoặc dùng thẻ Thuyền Cứu Hộ.`,
    festival: `Chọn 1 thành phố của bạn tổ chức Lễ Hội: tiền thuê <b>x2</b>, các lần tổ chức sau tăng lên <b>x3, x4</b>. Mỗi lúc chỉ 1 thành phố tổ chức Lễ Hội.`,
    tour: `Lượt kế tiếp được trả <b>$50K</b> để bay tới bất kỳ ô nào trên bàn cờ (bay qua Bắt Đầu vẫn nhận lương).`,
    chance: `Rút 1 thẻ Cơ Hội ngẫu nhiên: nhận thưởng, nộp phạt, ép bán nhà, trôi dạt ra Đảo Hoang, miễn phí nâng cấp…`,
    tax: `Nộp <b>10%</b> số tiền mặt đang có cho ngân hàng.`,
  };

  const CHANCE_CARDS = [
    { id: 'lottery', icon: '🎰', title: 'Trúng Xổ Số!', text: 'Nhận ngay $200K từ ngân hàng.', good: true },
    { id: 'bonus', icon: '💼', title: 'Thưởng Dự Án', text: 'Dự án thành công rực rỡ. Nhận $100K.', good: true },
    { id: 'refund', icon: '🧾', title: 'Hoàn Thuế', text: 'Ngân hàng hoàn lại cho bạn $150K.', good: true },
    { id: 'birthday', icon: '🎂', title: 'Sinh Nhật Vui Vẻ', text: 'Mỗi người chơi khác tặng bạn $50K.', good: true },
    { id: 'fine', icon: '🚨', title: 'Vượt Đèn Đỏ', text: 'Nộp phạt $100K cho ngân hàng.', good: false },
    { id: 'hospital', icon: '🏥', title: 'Viện Phí', text: 'Bạn bị cảm nặng. Trả $150K viện phí.', good: false },
    { id: 'repair', icon: '🔧', title: 'Bảo Trì Công Trình', text: 'Trả $20K cho mỗi cấp nhà bạn đang sở hữu.', good: false },
    { id: 'charity', icon: '🤝', title: 'Quỹ Từ Thiện', text: 'Tặng mỗi người chơi khác $30K.', good: false },
    { id: 'shipwreck', icon: '🌊', title: 'Đắm Tàu!', text: 'Bạn trôi dạt thẳng tới Đảo Hoang (không qua Bắt Đầu).', good: false },
    { id: 'home', icon: '🏁', title: 'Về Nhà', text: 'Bay thẳng về ô BẮT ĐẦU và nhận $300K.', good: true },
    { id: 'festival', icon: '🎉', title: 'Vé Lễ Hội', text: 'Tiến tới ô Lễ Hội Thế Giới.', good: true },
    { id: 'ticket', icon: '🎫', title: 'Vé Máy Bay', text: 'Tiến tới ô Chuyến Bay Thế Giới.', good: true },
    { id: 'back3', icon: '↩️', title: 'Quên Hộ Chiếu', text: 'Quay lại 3 ô để lấy hộ chiếu.', good: false },
    { id: 'vacation', icon: '🏖️', title: 'Kỳ Nghỉ Bất Ngờ', text: 'Tiến tới Khu Nghỉ Dưỡng gần nhất phía trước.', good: true },
    { id: 'freeUp', icon: '🛠️', title: 'Miễn Phí Nâng Cấp', text: 'Nâng 1 thành phố của bạn thêm 1 cấp miễn phí (tối đa Nhà cấp 3).', good: true },
    { id: 'shield', icon: '🛡️', title: 'Thẻ Miễn Thuê', text: 'Giữ thẻ này: miễn trả tiền thuê 1 lần.', good: true },
    { id: 'boat', icon: '🛶', title: 'Thuyền Cứu Hộ', text: 'Giữ thẻ này: rời Đảo Hoang miễn phí 1 lần.', good: true },
    { id: 'sellHouse', icon: '🏚️', title: 'Ép Bán Nhà', text: 'Bạn phải bán bớt 1 cấp nhà của một thành phố (nhận lại 50%).', good: false },
    { id: 'evict', icon: '📜', title: 'Thu Hồi Đất', text: 'Chọn 1 thành phố của đối thủ (chưa là Biểu Tượng): buộc bán lại cho ngân hàng.', good: true },
  ];
  const CARD_BY_ID = Object.fromEntries(CHANCE_CARDS.map((c) => [c.id, c]));

  // ===================================================================
  // 3. TIỆN ÍCH
  // ===================================================================
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Định dạng gọn: $850K, $1.25M */
  function fmt(k) {
    const sign = k < 0 ? '-' : '';
    const v = Math.abs(Math.round(k));
    if (v >= 1000) return `${sign}$${String(Math.round((v / 1000) * 100) / 100)}M`;
    return `${sign}$${v}K`;
  }
  /** Định dạng đầy đủ: $1,250K */
  function fmtFull(k) {
    const sign = k < 0 ? '-' : '';
    return `${sign}$${Math.abs(Math.round(k)).toLocaleString('en-US')}K`;
  }

  /** Vị trí ô trên lưới 9x9: ô 0 ở góc dưới trái, đi theo chiều kim đồng hồ */
  function gridPos(i) {
    if (i <= 8) return { row: 9 - i, col: 1 };
    if (i <= 16) return { row: 1, col: 1 + (i - 8) };
    if (i <= 24) return { row: 1 + (i - 16), col: 9 };
    return { row: 9, col: 9 - (i - 24) };
  }

  /** RNG có seed (mulberry32) — seed nằm trong state nên tải lại trang không "lắc lại" được */
  function rand() {
    const a = (state.seed = (state.seed + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Các tín hiệu điều khiển luồng
  class Cancelled extends Error {}
  class GameOver extends Error {}
  class TurnAbort extends Error {}

  /** Mỗi ván/lần tiếp tục là một "phiên". Đổi phiên sẽ hủy mọi tiến trình đang chờ của phiên cũ. */
  const Session = { id: 0, pending: new Set() };
  function resetSession() {
    Session.id++;
    const list = [...Session.pending];
    Session.pending.clear();
    list.forEach((cancel) => cancel());
  }
  function sleep(ms) {
    const sid = Session.id;
    return new Promise((res) => setTimeout(res, Math.max(0, ms || 0))).then(() => {
      if (sid !== Session.id) throw new Cancelled();
    });
  }
  /** Chờ thao tác của người chơi; tự hủy khi bắt đầu ván mới */
  function humanWait(setup) {
    const sid = Session.id;
    return new Promise((resolve, reject) => {
      let settled = false;
      const cancel = () => {
        if (settled) return;
        settled = true;
        reject(new Cancelled());
      };
      Session.pending.add(cancel);
      setup((value) => {
        if (settled) return;
        settled = true;
        Session.pending.delete(cancel);
        if (sid !== Session.id) reject(new Cancelled());
        else resolve(value);
      });
    });
  }

  // ===================================================================
  // 4. ÂM THANH — tổng hợp bằng Web Audio API
  // ===================================================================
  const Sound = (() => {
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let enabled = true;

    function ac() {
      if (!enabled || settings.speed === 'turbo') return null;
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.55;
          const comp = ctx.createDynamicsCompressor();
          master.connect(comp);
          comp.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) {
        return null;
      }
    }

    function tone(freq, at = 0, dur = 0.15, opt = {}) {
      const c = ac();
      if (!c) return;
      const { type = 'sine', vol = 0.2, attack = 0.006, slide = null } = opt;
      const t0 = c.currentTime + at;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    function noise(at = 0, dur = 0.1, opt = {}) {
      const c = ac();
      if (!c) return;
      const { vol = 0.2, freq = 1500, q = 1, type = 'bandpass', sweep = null } = opt;
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t0 = c.currentTime + at;
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t0);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t0, Math.random() * 0.8, dur + 0.05);
    }

    const seq = (list, opt) => list.forEach(([f, at, dur]) => tone(f, at, dur, opt));

    return {
      get enabled() {
        return enabled;
      },
      set enabled(v) {
        enabled = !!v;
        if (ctx) {
          if (!enabled && ctx.state === 'running') ctx.suspend();
          if (enabled && ctx.state === 'suspended') ctx.resume();
        }
      },
      unlock() {
        ac();
      },
      click() {
        tone(1100, 0, 0.04, { type: 'square', vol: 0.035 });
      },
      turn() {
        tone(660, 0, 0.12, { type: 'triangle', vol: 0.12 });
        tone(990, 0.09, 0.18, { type: 'triangle', vol: 0.1 });
      },
      dice() {
        for (let i = 0; i < 11; i++) {
          const at = i * 0.05 + Math.random() * 0.02;
          noise(at, 0.035, { vol: 0.3, freq: 2200 + Math.random() * 1800, q: 3 });
          tone(240 + Math.random() * 300, at, 0.03, { type: 'square', vol: 0.03 });
        }
      },
      diceLand() {
        noise(0, 0.07, { vol: 0.35, freq: 1100, q: 1.2 });
        tone(150, 0, 0.12, { type: 'triangle', vol: 0.22 });
        noise(0.09, 0.05, { vol: 0.2, freq: 1600, q: 2 });
      },
      step() {
        tone(560 + Math.random() * 90, 0, 0.07, { type: 'triangle', vol: 0.12 });
        noise(0, 0.03, { vol: 0.05, freq: 3000, q: 2 });
      },
      coin() {
        tone(988, 0, 0.08, { type: 'square', vol: 0.06 });
        tone(1319, 0.075, 0.32, { type: 'square', vol: 0.06 });
      },
      cash() {
        [1568, 1976, 2349].forEach((f, k) => tone(f, k * 0.06, 0.16, { type: 'sine', vol: 0.12 }));
      },
      pay() {
        // Tiếng tiền xu rơi lách cách
        for (let k = 0; k < 5; k++) {
          const at = k * 0.055 + Math.random() * 0.02;
          tone(2400 - k * 260 + Math.random() * 120, at, 0.09, { type: 'sine', vol: 0.09 });
          noise(at, 0.03, { vol: 0.05, freq: 5000, q: 4 });
        }
        tone(330, 0, 0.18, { type: 'triangle', vol: 0.08, slide: 220 });
      },
      buy() {
        seq([[523, 0, 0.14], [659, 0.07, 0.14], [784, 0.14, 0.14], [1047, 0.21, 0.32]], { type: 'triangle', vol: 0.18 });
      },
      build() {
        noise(0, 0.05, { vol: 0.35, freq: 500, q: 1 });
        tone(196, 0, 0.09, { type: 'square', vol: 0.06 });
        noise(0.13, 0.05, { vol: 0.35, freq: 650, q: 1 });
        tone(262, 0.13, 0.09, { type: 'square', vol: 0.06 });
        tone(784, 0.26, 0.22, { type: 'triangle', vol: 0.16 });
      },
      landmark() {
        seq([[523, 0, 0.18], [659, 0, 0.18], [784, 0, 0.18], [1047, 0.2, 0.5], [1319, 0.2, 0.5], [1568, 0.2, 0.55]], { type: 'sawtooth', vol: 0.045 });
        tone(1047, 0.2, 0.6, { type: 'triangle', vol: 0.15 });
      },
      buyout() {
        tone(110, 0, 0.35, { type: 'sawtooth', vol: 0.12, slide: 220 });
        seq([[440, 0.3, 0.18], [554, 0.3, 0.18], [659, 0.3, 0.3], [880, 0.45, 0.35]], { type: 'square', vol: 0.05 });
        noise(0, 0.3, { vol: 0.1, freq: 400, sweep: 2500, q: 0.8 });
      },
      chance() {
        const s = [1047, 1175, 1319, 1568, 1760, 2093];
        for (let k = 0; k < 7; k++) tone(s[Math.floor(Math.random() * s.length)], k * 0.05, 0.14, { type: 'sine', vol: 0.09 });
      },
      island() {
        tone(392, 0, 0.5, { type: 'sine', vol: 0.2, slide: 98 });
        noise(0, 0.9, { vol: 0.12, freq: 600, sweep: 200, type: 'lowpass', q: 0.5 });
      },
      fly() {
        noise(0, 0.8, { vol: 0.18, freq: 300, sweep: 3200, q: 0.8 });
        tone(300, 0, 0.8, { type: 'sine', vol: 0.05, slide: 900 });
      },
      festival() {
        seq([[784, 0, 0.12], [988, 0.08, 0.12], [1175, 0.16, 0.12], [1568, 0.24, 0.4]], { type: 'triangle', vol: 0.15 });
        for (let k = 0; k < 6; k++) noise(0.3 + k * 0.06, 0.05, { vol: 0.12, freq: 3000 + Math.random() * 3000, q: 5 });
      },
      doubles() {
        tone(880, 0, 0.12, { type: 'triangle', vol: 0.14 });
        tone(1175, 0.1, 0.22, { type: 'triangle', vol: 0.14 });
      },
      bad() {
        tone(220, 0, 0.32, { type: 'sawtooth', vol: 0.06, slide: 150 });
      },
      bankrupt() {
        [392, 370, 349, 311].forEach((f, k) => tone(f, k * 0.32, k === 3 ? 0.9 : 0.3, { type: 'sawtooth', vol: 0.07, slide: k === 3 ? 200 : null }));
      },
      win() {
        seq([[523, 0, 0.16], [659, 0.15, 0.16], [784, 0.3, 0.16], [1047, 0.45, 0.3], [784, 0.75, 0.14], [1047, 0.9, 0.7]], { type: 'triangle', vol: 0.2 });
        seq([[262, 0.45, 0.8], [392, 0.45, 0.8]], { type: 'sine', vol: 0.1 });
      },
    };
  })();

  // ===================================================================
  // 5. TRẠNG THÁI & LƯU TRỮ
  // ===================================================================
  let state = null;
  const settings = loadSettings();
  const S = () => SPEEDS[settings.speed] || SPEEDS.normal;

  function loadSettings() {
    const d = { sound: true, speed: 'normal', setup: null };
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (s && typeof s === 'object') {
        if (typeof s.sound === 'boolean') d.sound = s.sound;
        if (SPEEDS[s.speed]) d.speed = s.speed;
        if (s.setup && Array.isArray(s.setup.slots) && s.setup.slots.length === 4) d.setup = s.setup;
      }
    } catch (e) {
      /* localStorage có thể bị chặn (chế độ riêng tư) — dùng mặc định */
    }
    return d;
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      /* bỏ qua nếu không ghi được */
    }
  }
  function saveGame() {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
      /* bỏ qua nếu không ghi được */
    }
  }
  function loadGame() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || s.v !== SAVE_VERSION) return null;
      if (!Array.isArray(s.players) || s.players.length < 2 || s.players.length > 4) return null;
      if (!Array.isArray(s.props) || s.props.length !== TILE_COUNT) return null;
      if (typeof s.seed !== 'number' || !s.festival) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function createState(cfg) {
    return {
      v: SAVE_VERSION,
      status: 'playing',
      seed: (Math.random() * 4294967296) | 0,
      startMoney: cfg.startMoney,
      maxRounds: cfg.maxRounds || 0,
      players: cfg.players.map((pc, i) => ({
        id: i,
        name: pc.name,
        type: pc.type,
        color: pc.color,
        avatar: pc.avatar,
        money: cfg.startMoney,
        pos: START_TILE,
        bankrupt: false,
        outRound: 0,
        island: 0,
        tour: false,
        freeRent: 0,
        escape: 0,
      })),
      props: TILES.map((t) => (t.type === 'city' || t.type === 'resort' ? { owner: null, level: 0 } : null)),
      festival: { tile: null, mult: 1, editions: 0 },
      current: 0,
      round: 1,
      doubles: 0,
      turns: 0,
      lastRoll: [5, 2],
      deck: [],
      out: [],
      log: [],
      winner: null,
      winReason: null,
    };
  }

  // ===================================================================
  // 6. TRUY VẤN LUẬT CHƠI
  // ===================================================================
  const P = (id) => state.players[id];
  const isBot = (p) => p.type === 'bot';
  const alivePlayers = () => state.players.filter((p) => !p.bankrupt);
  const ownedBy = (pid) => PROP_TILES.filter((i) => state.props[i].owner === pid);
  const citiesOf = (pid) => CITY_TILES.filter((i) => state.props[i].owner === pid);
  const resortCount = (pid) => RESORT_TILES.filter((i) => state.props[i].owner === pid).length;
  const groupCount = (g, pid) => GROUP_TILES[g].filter((i) => state.props[i].owner === pid).length;
  const groupComplete = (g, pid) => GROUP_TILES[g].every((i) => state.props[i].owner === pid);
  const completedGroups = (pid) => GROUPS.reduce((n, g, k) => n + (groupComplete(k, pid) ? 1 : 0), 0);
  const totalLevels = (pid) => citiesOf(pid).reduce((s, i) => s + state.props[i].level, 0);

  function propValue(i) {
    const t = TILES[i];
    const pr = state.props[i];
    if (!pr || pr.owner == null) return 0;
    return t.type === 'resort' ? RESORT_PRICE : t.eco.value[pr.level];
  }
  const sellValue = (i) => r5(propValue(i) * SELL_RATE);
  const buyoutCost = (i) => propValue(i) * BUYOUT_RATE;

  function baseRent(i) {
    const t = TILES[i];
    const pr = state.props[i];
    if (!pr || pr.owner == null) return 0;
    if (t.type === 'resort') return RESORT_RENTS[resortCount(pr.owner)];
    return t.eco.rents[pr.level];
  }
  /** Hệ số lạm phát tiền thuê: 1 cho tới vòng 40, sau đó +5% mỗi vòng */
  const inflation = () => (state && state.round > INFLATION_START ? 1 + INFLATION_STEP * (state.round - INFLATION_START) : 1);
  function rentOf(i) {
    let r = baseRent(i);
    if (TILES[i].type === 'city' && state.festival.tile === i) r *= state.festival.mult;
    return r5(r * inflation());
  }
  const netWorth = (p) => p.money + ownedBy(p.id).reduce((s, i) => s + propValue(i), 0);
  const liquidation = (p) => ownedBy(p.id).reduce((s, i) => s + sellValue(i), 0);
  const nextFestivalMult = () => FESTIVAL_MULTS[Math.min(state.festival.editions + 1, FESTIVAL_MULTS.length) - 1];

  /** Kiểm tra 3 điều kiện độc quyền cho 1 người chơi */
  function winConditionFor(pid) {
    if (RESORT_TILES.every((i) => state.props[i].owner === pid)) {
      return { type: 'resort', icon: '🏖️', label: 'Độc Quyền Du Lịch', desc: 'Sở hữu cả 4 Khu Nghỉ Dưỡng' };
    }
    for (let s = 0; s < 4; s++) {
      if (SIDE_TILES[s].every((i) => state.props[i].owner === pid)) {
        return { type: 'line', icon: '🛣️', label: 'Độc Quyền 1 Cạnh', desc: `Sở hữu toàn bộ ${SIDE_NAMES[s]}` };
      }
    }
    if (completedGroups(pid) >= 3) {
      return { type: 'triple', icon: '🎨', label: 'Độc Quyền 3 Màu', desc: 'Sở hữu trọn vẹn 3 nhóm màu thành phố' };
    }
    return null;
  }

  function checkWin() {
    if (!state || state.status !== 'playing') return;
    const alive = alivePlayers();
    if (alive.length === 1) {
      endGame(alive[0], { type: 'last', icon: '🏆', label: 'Người Trụ Lại Cuối Cùng', desc: 'Tất cả đối thủ đã phá sản' });
    }
    const cur = state.players[state.current];
    const order = [cur, ...alive.filter((p) => p.id !== cur.id)].filter((p) => !p.bankrupt);
    for (const p of order) {
      const w = winConditionFor(p.id);
      if (w) endGame(p, w);
    }
  }

  function endGame(winner, reason) {
    if (state.status !== 'playing') throw new GameOver();
    state.status = 'gameover';
    state.winner = winner.id;
    state.winReason = reason;
    log(`🏆 ${pn(winner)} CHIẾN THẮNG — ${reason.icon} ${reason.label}!`, 'win');
    clearSelection();
    clearActions();
    setStatus(`🏆 ${pn(winner)} chiến thắng!`);
    renderAll();
    layoutTokens();
    saveGame();
    Sound.win();
    showGameOver(true);
    throw new GameOver();
  }

  // ===================================================================
  // 7. ENGINE — VÒNG LẶP LƯỢT CHƠI
  // ===================================================================
  const pn = (p) => `<b class="pn" style="color:${p.color}">${esc(p.name)}</b>`;
  const tn = (i) => `<b class="tn">${esc(TILES[i].name)}</b>`;

  function log(html, kind = '') {
    if (!state) return;
    state.log.unshift({ r: state.round, h: html, k: kind });
    if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
    renderLog();
  }

  async function runLoop() {
    const sid = Session.id;
    try {
      while (state && state.status === 'playing') {
        if (sid !== Session.id) return;
        const p = state.players[state.current];
        if (p.bankrupt) {
          nextPlayer();
          continue;
        }
        // Điểm lưu (checkpoint): đầu mỗi lần lắc. Seed RNG nằm trong state nên kết quả không đổi khi tải lại.
        saveGame();
        renderAll();
        layoutTokens();
        await turnIntro(p, state.doubles > 0);
        let again = false;
        try {
          again = await playSegment(p);
        } catch (e) {
          if (!(e instanceof TurnAbort)) throw e;
          again = false;
        }
        if (sid !== Session.id) return;
        renderAll();
        if (again && !p.bankrupt && state.status === 'playing') {
          await sleep(S().bot * 0.4);
          continue;
        }
        nextPlayer();
      }
    } catch (e) {
      if (e instanceof Cancelled || e instanceof GameOver) return;
      console.error(e);
      toast(`⚠️ Lỗi: ${esc(e && e.message ? e.message : e)}`, 'bad', 6000);
    }
  }

  function nextPlayer() {
    state.doubles = 0;
    const n = state.players.length;
    let i = state.current;
    let wrapped = false;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (i === 0) wrapped = true;
      if (!state.players[i].bankrupt) break;
    }
    state.current = i;
    state.turns++;
    if (wrapped) {
      if (state.maxRounds && state.round >= state.maxRounds) {
        const richest = alivePlayers().sort((a, b) => netWorth(b) - netWorth(a))[0];
        endGame(richest, { type: 'rounds', icon: '⏱️', label: 'Giàu Nhất Khi Hết Vòng', desc: `Tổng tài sản lớn nhất sau ${state.maxRounds} vòng` });
      }
      state.round++;
      log(`Vòng ${state.round}`, 'round');
      if (state.round === INFLATION_START + 1) {
        log(`📈 Bắt đầu <b>lạm phát</b>: từ vòng này tiền thuê tăng thêm ${Math.round(INFLATION_STEP * 100)}% mỗi vòng!`, 'bad');
        toast(`📈 Lạm phát! Tiền thuê tăng ${Math.round(INFLATION_STEP * 100)}% mỗi vòng`, 'warn', 3200);
      }
    }
  }

  async function turnIntro(p, bonus) {
    clearActions();
    if (!bonus) setStatus('');
    renderPlayers();
    if (bonus) {
      await banner(p, '🎲 Đổ đôi — được lắc thêm lượt!');
      return;
    }
    Sound.turn();
    let sub = isBot(p) ? '🤖 Máy đang chơi' : '👤 Đến lượt bạn!';
    if (p.island > 0) sub = `🏝️ Đang kẹt trên Đảo Hoang (còn ${p.island} lượt)`;
    else if (p.tour) sub = '✈️ Sẵn sàng cho Chuyến Bay Thế Giới';
    await banner(p, sub);
  }

  /** Một lần lắc (hoặc một hành động thay thế lắc). Trả về true nếu được lắc thêm (đổ đôi). */
  async function playSegment(p) {
    if (p.island > 0) return islandSegment(p);
    if (p.tour) {
      p.tour = false;
      const flew = await tourSegment(p);
      if (flew) return false;
    }
    return rollSegment(p);
  }

  async function rollSegment(p) {
    const [d1, d2] = await rollDice(p);
    const dbl = d1 === d2;
    if (dbl) {
      state.doubles++;
      if (state.doubles >= 3) {
        log(`😱 ${pn(p)} đổ đôi 3 lần liên tiếp — bị đưa thẳng ra Đảo Hoang!`, 'bad');
        toast(`😱 3 lần đôi liên tiếp! ${esc(p.name)} bị đưa ra Đảo Hoang`, 'bad');
        await sendToIsland(p);
        return false;
      }
    }
    await moveSteps(p, d1 + d2);
    await landOn(p);
    return dbl && p.island === 0 && !p.bankrupt;
  }

  async function rollDice(p, { auto = false } = {}) {
    if (!isBot(p) && !auto) {
      await stageActions({
        status: `<span class="who">${esc(p.avatar)}</span> <b>${esc(p.name)}</b>, đến lượt bạn!${state.doubles > 0 ? ' <span class="dbl-tag">THÊM LƯỢT</span>' : ''}`,
        buttons: [{ label: '🎲 LẮC XÚC XẮC', value: 'roll', style: 'primary', big: true, hotkey: true }],
        hint: 'Phím tắt: Space / Enter',
      });
    } else if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang lắc xúc xắc<span class="dots"></span>`);
      await sleep(S().bot);
    }
    const d1 = 1 + Math.floor(rand() * 6);
    const d2 = 1 + Math.floor(rand() * 6);
    state.lastRoll = [d1, d2];
    setStatus(`${pn(p)} đang lắc…`);
    await animateDice(d1, d2);
    const dbl = d1 === d2;
    setStatus(`🎲 <b>${d1}</b> + <b>${d2}</b> = <span class="sum">${d1 + d2}</span>${dbl ? ' <span class="dbl-tag">ĐÔI!</span>' : ''}`);
    log(`🎲 ${pn(p)} đổ ${d1} + ${d2} = <b>${d1 + d2}</b>${dbl ? ' — <b class="dbl">ĐÔI!</b>' : ''}`, 'dice');
    if (dbl) Sound.doubles();
    return [d1, d2];
  }

  async function islandSegment(p) {
    const canPay = p.money >= ISLAND_FEE;
    let choice;
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang tính cách rời đảo<span class="dots"></span>`);
      await sleep(S().bot);
      choice = AI.islandChoice(p, canPay);
    } else {
      const buttons = [{ label: '🎲 Đổ tìm đôi', value: 'roll', style: 'primary', hotkey: true }];
      buttons.push({ label: `💵 Trả ${fmt(ISLAND_FEE)} rời đảo`, value: 'pay', style: 'gold', disabled: !canPay });
      if (p.escape > 0) buttons.push({ label: `🛶 Dùng Thuyền Cứu Hộ (${p.escape})`, value: 'card', style: 'blue' });
      choice = await stageActions({ status: `🏝️ ${pn(p)} đang kẹt trên Đảo Hoang — còn <b>${p.island}</b> lượt`, buttons });
    }
    if (choice === 'card' && p.escape > 0) {
      p.escape--;
      p.island = 0;
      log(`🛶 ${pn(p)} dùng Thuyền Cứu Hộ rời Đảo Hoang miễn phí!`, 'good');
      Sound.chance();
      renderPlayers();
      return rollSegment(p);
    }
    if (choice === 'pay' && p.money >= ISLAND_FEE) {
      log(`💵 ${pn(p)} trả ${fmtFull(ISLAND_FEE)} để rời Đảo Hoang.`, 'pay');
      await pay(p, ISLAND_FEE, null);
      p.island = 0;
      renderPlayers();
      return rollSegment(p);
    }
    const [d1, d2] = await rollDice(p, { auto: true });
    if (d1 === d2) {
      p.island = 0;
      log(`🎉 ${pn(p)} đổ được đôi và thoát khỏi Đảo Hoang!`, 'good');
      toast(`🎉 ${esc(p.name)} thoát khỏi Đảo Hoang!`, 'good');
      await moveSteps(p, d1 + d2);
      await landOn(p);
      return false;
    }
    p.island--;
    if (p.island <= 0) {
      p.island = 0;
      log(`🏝️ ${pn(p)} đã chịu đủ ${ISLAND_TURNS} lượt — lượt sau được rời đảo.`);
    } else {
      log(`🏝️ ${pn(p)} không đổ được đôi, còn kẹt ${p.island} lượt.`);
    }
    renderPlayers();
    await sleep(S().bot * 0.6);
    return false;
  }

  async function tourSegment(p) {
    if (p.money < TOUR_FEE) {
      log(`✈️ ${pn(p)} không đủ ${fmtFull(TOUR_FEE)} để bay — đi tiếp như thường.`);
      return false;
    }
    let target = null;
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang chọn điểm đến<span class="dots"></span>`);
      await sleep(S().bot);
      target = AI.tourTarget(p);
      if (target == null) {
        log(`✈️ ${pn(p)} quyết định không bay, lắc xúc xắc như thường.`);
        return false;
      }
      await flashTile(target);
    } else {
      const cands = [];
      for (let i = 0; i < TILE_COUNT; i++) if (i !== TOUR_TILE) cands.push(i);
      target = await selectTile(p, cands, {
        title: `✈️ <b>Chuyến Bay Thế Giới</b> — chọn ô muốn bay tới (phí ${fmt(TOUR_FEE)})`,
        cancelLabel: '🎲 Không bay, lắc xúc xắc',
      });
      if (target == null) {
        log(`✈️ ${pn(p)} không bay, lắc xúc xắc như thường.`);
        return false;
      }
    }
    log(`✈️ ${pn(p)} trả ${fmtFull(TOUR_FEE)} bay tới ${tn(target)}.`, 'pay');
    await pay(p, TOUR_FEE, null);
    await flyTo(p, target);
    await landOn(p);
    return true;
  }

  // ---------- Di chuyển ----------
  async function moveSteps(p, steps) {
    for (let s = 0; s < steps; s++) {
      p.pos = (p.pos + 1) % TILE_COUNT;
      layoutTokens();
      hopToken(p);
      Sound.step();
      if (p.pos === START_TILE) passStart(p);
      await sleep(S().step);
    }
  }

  async function moveBack(p, steps) {
    for (let s = 0; s < steps; s++) {
      p.pos = (p.pos - 1 + TILE_COUNT) % TILE_COUNT;
      layoutTokens();
      hopToken(p);
      Sound.step();
      await sleep(S().step);
    }
  }

  function passStart(p) {
    p.money += START_SALARY;
    moneyFx(p, START_SALARY);
    Sound.coin();
    tileFx(START_TILE, `+${fmt(START_SALARY)}`, 'gain');
    log(`🏁 ${pn(p)} đi qua BẮT ĐẦU, nhận ${fmtFull(START_SALARY)}.`, 'good');
    renderPlayers();
  }

  /** Bay thẳng tới ô (đi tiến). Nếu vòng qua/đáp xuống ô Bắt Đầu thì nhận lương. */
  async function flyTo(p, target, { salary = true } = {}) {
    const from = p.pos;
    const passes = salary && (target === START_TILE || target < from);
    p.pos = target;
    setStatus(`✈️ ${pn(p)} bay tới ${tn(target)}…`);
    Sound.fly();
    flyToken(p);
    await sleep(S().fly);
    landToken(p);
    if (passes) passStart(p);
  }

  async function sendToIsland(p) {
    await flyTo(p, ISLAND_TILE, { salary: false });
    onIsland(p);
  }

  // ---------- Tiền ----------
  function gain(p, amount) {
    if (amount <= 0) return;
    p.money += amount;
    moneyFx(p, amount);
    Sound.cash();
    renderPlayers();
  }

  /** Thanh toán. Nếu thiếu tiền: buộc bán tài sản; không đủ thì phá sản. Trả về false nếu phá sản. */
  async function pay(from, amount, to = null) {
    const amt = Math.max(0, Math.round(amount));
    if (amt === 0) return true;
    if (from.money < amt) {
      const ok = await raiseFunds(from, amt, to);
      if (!ok) {
        await goBankrupt(from, to);
        return false;
      }
    }
    from.money -= amt;
    moneyFx(from, -amt);
    if (to) {
      to.money += amt;
      moneyFx(to, amt);
    }
    Sound.pay();
    renderPlayers();
    return true;
  }

  async function raiseFunds(p, amount, to) {
    if (p.money + liquidation(p) < amount) {
      if (!isBot(p)) await bankruptNotice(p, amount, to);
      return false;
    }
    log(`⚠️ ${pn(p)} thiếu ${fmtFull(amount - p.money)}, buộc phải bán bớt tài sản.`, 'bad');
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang bán tài sản để trả nợ<span class="dots"></span>`);
      for (const i of AI.sellOrder(p)) {
        if (p.money >= amount) break;
        sellProperty(p, i);
        await sleep(S().bot * 0.5);
      }
      return p.money >= amount;
    }
    await sellDialog(p, amount, to);
    return p.money >= amount;
  }

  function resetProperty(i) {
    const pr = state.props[i];
    pr.owner = null;
    pr.level = 0;
    if (state.festival.tile === i) {
      state.festival.tile = null;
      state.festival.mult = 1;
      log(`🎉 Lễ Hội tại ${tn(i)} đã kết thúc.`);
    }
  }

  function sellProperty(p, i) {
    const v = sellValue(i);
    resetProperty(i);
    p.money += v;
    moneyFx(p, v);
    log(`💱 ${pn(p)} bán ${tn(i)} cho ngân hàng, nhận ${fmtFull(v)}.`, 'bad');
    Sound.cash();
    tileFx(i, '💱', 'loss');
    renderAll();
  }

  async function goBankrupt(p, creditor) {
    let total = p.money;
    for (const i of ownedBy(p.id)) {
      total += sellValue(i);
      resetProperty(i);
    }
    p.money = 0;
    p.bankrupt = true;
    p.island = 0;
    p.tour = false;
    p.outRound = state.round;
    state.out.push(p.id);
    if (creditor && !creditor.bankrupt && total > 0) {
      creditor.money += total;
      moneyFx(creditor, total);
    }
    log(`💀 ${pn(p)} PHÁ SẢN!${creditor ? ` Toàn bộ ${fmtFull(total)} còn lại thuộc về ${pn(creditor)}.` : ''}`, 'bad');
    Sound.bankrupt();
    toast(`💀 ${esc(p.name)} đã phá sản!`, 'bad', 2800);
    renderAll();
    layoutTokens();
    await sleep(S().bot);
    checkWin();
    const humansLeft = state.players.some((q) => !isBot(q) && !q.bankrupt);
    const hadHumans = state.players.some((q) => !isBot(q));
    if (!isBot(p) && hadHumans && !humansLeft) {
      const v = await openModal({
        icon: '💀',
        title: 'Bạn đã phá sản!',
        html: `<p>Không còn người chơi nào trên bàn. Bạn có thể xem các máy đấu tiếp để tìm ra nhà vô địch hoặc bắt đầu ván mới.</p>`,
        buttons: [
          { label: '🆕 Ván mới', value: 'new', style: 'ghost' },
          { label: '👀 Xem tiếp', value: 'watch', style: 'primary', hotkey: true },
        ],
      });
      if (v === 'new') {
        showSetup();
        throw new Cancelled();
      }
    }
    if (state.players[state.current].id === p.id) throw new TurnAbort();
  }

  // ---------- Xử lý khi dừng tại ô ----------
  async function landOn(p) {
    const i = p.pos;
    const t = TILES[i];
    pulseTile(i);
    setStatus(`📍 ${pn(p)} dừng tại ${tn(i)}`);
    renderAll();
    switch (t.type) {
      case 'start':
        await onStart(p);
        break;
      case 'city':
        await onCity(p, i);
        break;
      case 'resort':
        await onResort(p, i);
        break;
      case 'chance':
        await onChance(p);
        break;
      case 'tax':
        await onTax(p);
        break;
      case 'island':
        onIsland(p);
        break;
      case 'festival':
        await onFestival(p);
        break;
      case 'tour':
        onTour(p);
        break;
      default:
        break;
    }
    renderAll();
    checkWin();
  }

  async function onCity(p, i) {
    const pr = state.props[i];
    if (pr.owner == null) {
      await offerPurchase(p, i);
      return;
    }
    if (pr.owner === p.id) {
      await offerUpgrade(p, i, { landmark: true, title: 'Nâng cấp' });
      return;
    }
    await chargeRent(p, P(pr.owner), i);
    await offerBuyout(p, i);
  }

  async function offerPurchase(p, i) {
    const t = TILES[i];
    const options = [1, 2, 3].map((L) => ({ level: L, cost: t.eco.value[L], rent: t.eco.rents[L] }));
    if (p.money < options[0].cost) {
      log(`${pn(p)} không đủ tiền mua ${tn(i)} (${fmtFull(options[0].cost)}).`);
      if (!isBot(p)) toast(`Không đủ tiền mua ${esc(t.name)}`, 'bad');
      return;
    }
    let level;
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang cân nhắc mua ${tn(i)}<span class="dots"></span>`);
      await sleep(S().bot);
      level = AI.purchaseLevel(p, i, options.filter((o) => o.cost <= p.money));
    } else {
      level = await purchaseDialog(p, i, options);
    }
    if (!level) {
      log(`${pn(p)} bỏ qua ${tn(i)}.`);
      return;
    }
    const cost = t.eco.value[level];
    const pr = state.props[i];
    p.money -= cost;
    pr.owner = p.id;
    pr.level = level;
    moneyFx(p, -cost);
    log(`🏗️ ${pn(p)} mua ${tn(i)} — ${LEVEL_ICONS[level]} ${LEVEL_NAMES[level]} (${fmtFull(cost)}).`, 'buy');
    Sound.buy();
    tileFx(i, LEVEL_ICONS[level], 'build');
    renderAll();
    checkWin();
  }

  async function offerUpgrade(p, i, { landmark = true, title = 'Nâng cấp' } = {}) {
    const t = TILES[i];
    const pr = state.props[i];
    if (t.type !== 'city' || pr.owner !== p.id) return;
    if (pr.level >= 4) {
      log(`🗼 ${tn(i)} của ${pn(p)} đã là Biểu Tượng.`);
      return;
    }
    const maxLevel = pr.level < 3 ? 3 : landmark ? 4 : 3;
    const options = [];
    for (let L = pr.level + 1; L <= maxLevel; L++) {
      options.push({ level: L, cost: t.eco.value[L] - t.eco.value[pr.level], rent: t.eco.rents[L] });
    }
    if (!options.length) {
      log(`${tn(i)} đã đạt Nhà cấp 3 — hãy dừng lại đây lần nữa để xây Biểu Tượng.`);
      return;
    }
    const affordable = options.filter((o) => o.cost <= p.money);
    if (!affordable.length) {
      log(`${pn(p)} không đủ tiền nâng cấp ${tn(i)}.`);
      if (!isBot(p)) toast('Không đủ tiền để nâng cấp', 'bad');
      return;
    }
    let level;
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang tính chuyện nâng cấp ${tn(i)}<span class="dots"></span>`);
      await sleep(S().bot);
      level = AI.upgradeLevel(p, i, affordable);
    } else {
      level = await upgradeDialog(p, i, options, title);
    }
    if (!level) return;
    const cost = t.eco.value[level] - t.eco.value[pr.level];
    p.money -= cost;
    pr.level = level;
    moneyFx(p, -cost);
    if (level === 4) {
      log(`🗼 ${pn(p)} xây BIỂU TƯỢNG tại ${tn(i)} (${fmtFull(cost)}) — không ai có thể mua lại!`, 'buy');
      Sound.landmark();
      tileFx(i, '🗼', 'build big');
      toast(`🗼 ${esc(p.name)} xây Biểu Tượng tại ${esc(t.name)}!`, 'gold');
    } else {
      log(`🔨 ${pn(p)} nâng cấp ${tn(i)} lên ${LEVEL_ICONS[level]} ${LEVEL_NAMES[level]} (${fmtFull(cost)}).`, 'buy');
      Sound.build();
      tileFx(i, LEVEL_ICONS[level], 'build');
    }
    renderAll();
  }

  async function chargeRent(p, owner, i) {
    const rent = rentOf(i);
    if (rent <= 0) return;
    if (p.freeRent > 0) {
      let use;
      if (isBot(p)) {
        use = AI.useShield(p, rent);
      } else {
        use = await openModal({
          icon: '🛡️',
          title: 'Dùng Thẻ Miễn Thuê?',
          html: `<p>Bạn sắp phải trả <b>${fmtFull(rent)}</b> cho ${pn(owner)} tại ${tn(i)}.</p><p>Dùng 1 Thẻ Miễn Thuê (còn ${p.freeRent}) để không phải trả lần này?</p>`,
          buttons: [
            { label: 'Trả tiền', value: false, style: 'ghost' },
            { label: '🛡️ Dùng thẻ', value: true, style: 'green', hotkey: true },
          ],
        });
      }
      if (use) {
        p.freeRent--;
        log(`🛡️ ${pn(p)} dùng Thẻ Miễn Thuê tại ${tn(i)} (tiết kiệm ${fmtFull(rent)}).`, 'good');
        Sound.chance();
        tileFx(i, '🛡️', 'gain');
        renderPlayers();
        return;
      }
    }
    const fest = TILES[i].type === 'city' && state.festival.tile === i ? ` (🎉x${state.festival.mult})` : '';
    log(`💸 ${pn(p)} trả ${fmtFull(rent)} tiền thuê${fest} cho ${pn(owner)} tại ${tn(i)}.`, 'pay');
    tileFx(i, `-${fmt(rent)}`, 'loss');
    await pay(p, rent, owner);
  }

  async function offerBuyout(p, i) {
    const t = TILES[i];
    const pr = state.props[i];
    if (p.bankrupt || t.type !== 'city' || pr.owner == null || pr.owner === p.id) return;
    if (pr.level >= 4) {
      log(`🔒 ${tn(i)} là Biểu Tượng — không thể mua lại.`);
      return;
    }
    const cost = buyoutCost(i);
    const owner = P(pr.owner);
    if (p.money < cost) {
      if (!isBot(p)) toast(`Cần ${fmtFull(cost)} để mua lại ${esc(t.name)}`, 'info');
      return;
    }
    let yes;
    if (isBot(p)) {
      setStatus(`🤖 ${pn(p)} đang cân nhắc mua lại ${tn(i)}<span class="dots"></span>`);
      await sleep(S().bot);
      yes = AI.wantBuyout(p, i, cost);
    } else {
      yes = await buyoutDialog(p, i, cost);
    }
    if (!yes) return;
    p.money -= cost;
    owner.money += cost;
    moneyFx(p, -cost);
    moneyFx(owner, cost);
    pr.owner = p.id;
    log(`💥 ${pn(p)} MUA LẠI ${tn(i)} từ ${pn(owner)} với giá ${fmtFull(cost)}!`, 'buyout');
    Sound.buyout();
    tileFx(i, '💥', 'big');
    toast(`💥 ${esc(p.name)} mua lại ${esc(t.name)} từ ${esc(owner.name)}!`, 'warn');
    renderAll();
    checkWin();
    await offerUpgrade(p, i, { landmark: false, title: 'Nâng cấp sau khi mua lại' });
  }

  async function onResort(p, i) {
    const pr = state.props[i];
    if (pr.owner == null) {
      if (p.money < RESORT_PRICE) {
        log(`${pn(p)} không đủ tiền mua Khu Nghỉ Dưỡng ${tn(i)}.`);
        if (!isBot(p)) toast(`Không đủ tiền mua ${esc(TILES[i].name)}`, 'bad');
        return;
      }
      let yes;
      if (isBot(p)) {
        setStatus(`🤖 ${pn(p)} đang cân nhắc mua ${tn(i)}<span class="dots"></span>`);
        await sleep(S().bot);
        yes = AI.wantResort(p, i);
      } else {
        yes = await resortDialog(p, i);
      }
      if (!yes) {
        log(`${pn(p)} bỏ qua ${tn(i)}.`);
        return;
      }
      p.money -= RESORT_PRICE;
      pr.owner = p.id;
      pr.level = 1;
      moneyFx(p, -RESORT_PRICE);
      log(`🏖️ ${pn(p)} mua Khu Nghỉ Dưỡng ${tn(i)} (${fmtFull(RESORT_PRICE)}) — đang có ${resortCount(p.id)}/4 khu.`, 'buy');
      Sound.buy();
      tileFx(i, '🏖️', 'build');
      renderAll();
      checkWin();
      return;
    }
    if (pr.owner === p.id) {
      log(`🏖️ ${pn(p)} nghỉ dưỡng tại ${tn(i)} của chính mình.`);
      return;
    }
    await chargeRent(p, P(pr.owner), i);
  }

  async function onStart(p) {
    const cands = citiesOf(p.id).filter((i) => {
      const L = state.props[i].level;
      return L < 3 && TILES[i].eco.costs[L + 1] <= p.money;
    });
    if (!cands.length) {
      log(`🏁 ${pn(p)} dừng đúng ô BẮT ĐẦU.`);
      return;
    }
    let target;
    if (isBot(p)) {
      await sleep(S().bot);
      target = AI.startTarget(p, cands);
      if (target != null) await flashTile(target);
    } else {
      target = await selectTile(p, cands, {
        title: '🏁 Dừng đúng ô <b>BẮT ĐẦU</b>! Chọn 1 thành phố để nâng cấp',
        cancelLabel: 'Bỏ qua',
      });
    }
    if (target == null) {
      log(`🏁 ${pn(p)} dừng đúng ô BẮT ĐẦU nhưng không nâng cấp.`);
      return;
    }
    await offerUpgrade(p, target, { landmark: false, title: 'Nâng cấp từ ô Bắt Đầu' });
  }

  async function onTax(p) {
    const amt = Math.round(p.money * TAX_RATE);
    if (amt <= 0) {
      log(`💸 ${pn(p)} không có tiền mặt để nộp thuế.`);
      return;
    }
    log(`💸 ${pn(p)} nộp thuế 10% tiền mặt: ${fmtFull(amt)}.`, 'pay');
    tileFx(TAX_TILE, `-${fmt(amt)}`, 'loss');
    await pay(p, amt, null);
  }

  function onIsland(p) {
    p.island = ISLAND_TURNS;
    log(`🏝️ ${pn(p)} mắc kẹt trên Đảo Hoang ${ISLAND_TURNS} lượt!`, 'bad');
    Sound.island();
    toast(`🏝️ ${esc(p.name)} mắc kẹt trên Đảo Hoang!`, 'info');
    renderPlayers();
  }

  async function onFestival(p) {
    const cands = citiesOf(p.id);
    if (!cands.length) {
      log(`🎉 ${pn(p)} chưa có thành phố nào để tổ chức Lễ Hội.`);
      return;
    }
    let target;
    if (isBot(p)) {
      await sleep(S().bot);
      target = AI.festivalTarget(p, cands);
      await flashTile(target);
    } else {
      target = await selectTile(p, cands, {
        title: `🎉 Chọn thành phố tổ chức <b>Lễ Hội Thế Giới lần ${state.festival.editions + 1}</b> — tiền thuê <b>x${nextFestivalMult()}</b>`,
      });
    }
    const f = state.festival;
    f.editions++;
    f.mult = FESTIVAL_MULTS[Math.min(f.editions, FESTIVAL_MULTS.length) - 1];
    f.tile = target;
    log(`🎉 Lễ Hội Thế Giới lần ${f.editions} khai mạc tại ${tn(target)} — tiền thuê x${f.mult}!`, 'good');
    Sound.festival();
    tileFx(target, `🎉x${f.mult}`, 'big');
    toast(`🎉 Lễ Hội lần ${f.editions} tại ${esc(TILES[target].name)} — thuê x${f.mult}!`, 'gold');
    renderAll();
  }

  function onTour(p) {
    p.tour = true;
    log(`✈️ ${pn(p)} tới Sân Bay — lượt sau có thể bay tới bất kỳ ô nào (${fmtFull(TOUR_FEE)}).`);
    Sound.fly();
    renderPlayers();
  }

  async function onChance(p) {
    if (!state.deck.length) state.deck = shuffle(CHANCE_CARDS.map((c) => c.id));
    const card = CARD_BY_ID[state.deck.pop()];
    Sound.chance();
    log(`🎁 ${pn(p)} rút thẻ Cơ Hội: <b>${card.icon} ${esc(card.title)}</b>`, 'chance');
    await chanceDialog(p, card);
    await applyCard(p, card);
  }

  async function applyCard(p, card) {
    switch (card.id) {
      case 'lottery':
        gain(p, 200);
        break;
      case 'bonus':
        gain(p, 100);
        break;
      case 'refund':
        gain(p, 150);
        break;
      case 'birthday':
        for (const o of state.players) {
          if (o.id === p.id || o.bankrupt) continue;
          log(`🎂 ${pn(o)} tặng ${pn(p)} ${fmtFull(50)}.`);
          await pay(o, 50, p);
        }
        break;
      case 'fine':
        await pay(p, 100, null);
        break;
      case 'hospital':
        await pay(p, 150, null);
        break;
      case 'repair': {
        const lv = totalLevels(p.id);
        if (lv > 0) {
          log(`🔧 ${pn(p)} có ${lv} cấp nhà — trả ${fmtFull(lv * 20)} phí bảo trì.`, 'pay');
          await pay(p, lv * 20, null);
        } else {
          log(`🔧 ${pn(p)} chưa có công trình nào — không mất phí.`);
        }
        break;
      }
      case 'charity':
        for (const o of state.players) {
          if (o.id === p.id || o.bankrupt) continue;
          await pay(p, 30, o);
        }
        break;
      case 'shipwreck':
        await sendToIsland(p);
        break;
      case 'home':
        await flyTo(p, START_TILE);
        await landOn(p);
        break;
      case 'festival':
        await flyTo(p, FESTIVAL_TILE);
        await landOn(p);
        break;
      case 'ticket':
        await flyTo(p, TOUR_TILE);
        await landOn(p);
        break;
      case 'back3':
        await moveBack(p, 3);
        await landOn(p);
        break;
      case 'vacation': {
        const target = RESORT_TILES.find((r) => r > p.pos);
        await flyTo(p, target == null ? RESORT_TILES[0] : target);
        await landOn(p);
        break;
      }
      case 'freeUp':
        await cardFreeUpgrade(p);
        break;
      case 'shield':
        p.freeRent++;
        break;
      case 'boat':
        p.escape++;
        break;
      case 'sellHouse':
        await cardSellHouse(p);
        break;
      case 'evict':
        await cardEvict(p);
        break;
      default:
        break;
    }
    renderAll();
  }

  async function cardFreeUpgrade(p) {
    const cands = citiesOf(p.id).filter((i) => state.props[i].level < 3);
    if (!cands.length) {
      log(`🛠️ ${pn(p)} không có thành phố phù hợp — nhận ${fmtFull(100)} thay thế.`);
      gain(p, 100);
      return;
    }
    let target;
    if (isBot(p)) {
      await sleep(S().bot);
      target = AI.freeUpgradeTarget(p, cands);
      await flashTile(target);
    } else {
      target = await selectTile(p, cands, { title: '🛠️ Chọn thành phố được <b>nâng cấp miễn phí</b> thêm 1 cấp' });
    }
    const pr = state.props[target];
    pr.level++;
    log(`🛠️ ${pn(p)} nâng cấp miễn phí ${tn(target)} lên ${LEVEL_ICONS[pr.level]} ${LEVEL_NAMES[pr.level]}.`, 'good');
    Sound.build();
    tileFx(target, LEVEL_ICONS[pr.level], 'build');
    renderAll();
  }

  async function cardSellHouse(p) {
    const cands = citiesOf(p.id).filter((i) => state.props[i].level < 4);
    if (!cands.length) {
      log(`🏚️ ${pn(p)} không có nhà nào phải bán — thoát nạn!`);
      return;
    }
    let target;
    if (isBot(p)) {
      await sleep(S().bot);
      target = AI.sellHouseTarget(p, cands);
      await flashTile(target);
    } else {
      target = await selectTile(p, cands, { title: '🏚️ <b>Ép bán nhà</b>: chọn thành phố phải bán bớt 1 cấp (nhận lại 50%)' });
    }
    const pr = state.props[target];
    const refund = r5(TILES[target].eco.costs[pr.level] * SELL_RATE);
    if (pr.level <= 1) {
      resetProperty(target);
      log(`🏚️ ${pn(p)} buộc phải bán ${tn(target)} về ngân hàng, nhận ${fmtFull(refund)}.`, 'bad');
    } else {
      pr.level--;
      log(`🏚️ ${pn(p)} bán bớt 1 cấp nhà tại ${tn(target)}, nhận ${fmtFull(refund)}.`, 'bad');
    }
    p.money += refund;
    moneyFx(p, refund);
    Sound.pay();
    tileFx(target, '🏚️', 'loss');
    renderAll();
  }

  async function cardEvict(p) {
    const cands = CITY_TILES.filter((i) => {
      const pr = state.props[i];
      return pr.owner != null && pr.owner !== p.id && pr.level < 4;
    });
    if (!cands.length) {
      log('📜 Không có thành phố nào của đối thủ có thể bị thu hồi.');
      return;
    }
    let target;
    if (isBot(p)) {
      await sleep(S().bot);
      target = AI.evictTarget(p, cands);
      await flashTile(target);
    } else {
      target = await selectTile(p, cands, { title: '📜 <b>Thu hồi đất</b>: chọn 1 thành phố của đối thủ buộc bán về ngân hàng' });
    }
    const owner = P(state.props[target].owner);
    const v = sellValue(target);
    resetProperty(target);
    owner.money += v;
    moneyFx(owner, v);
    log(`📜 ${pn(p)} thu hồi ${tn(target)} của ${pn(owner)}! ${pn(owner)} nhận lại ${fmtFull(v)}.`, 'buyout');
    Sound.buyout();
    tileFx(target, '📜', 'big');
    renderAll();
  }

  // ===================================================================
  // 8. AI CHO MÁY
  // ===================================================================
  const AI = {
    /** Số tiền nên giữ lại để không phá sản khi dẫm phải ô đắt của đối thủ */
    reserve(p) {
      const rents = [];
      for (const i of PROP_TILES) {
        const o = state.props[i].owner;
        if (o != null && o !== p.id) rents.push(rentOf(i));
      }
      rents.sort((a, b) => b - a);
      const top = rents.slice(0, 3);
      const avg = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
      return Math.round(Math.min(120 + avg * 0.55, 1300));
    },

    /** Các ô mà nếu pid chiếm được sẽ thắng ngay lập tức */
    critical(pid) {
      const crit = new Set();
      const missR = RESORT_TILES.filter((i) => state.props[i].owner !== pid);
      if (missR.length === 1) crit.add(missR[0]);
      for (const side of SIDE_TILES) {
        const miss = side.filter((i) => state.props[i].owner !== pid);
        if (miss.length === 1) crit.add(miss[0]);
      }
      if (completedGroups(pid) >= 2) {
        GROUP_TILES.forEach((tiles) => {
          const miss = tiles.filter((i) => state.props[i].owner !== pid);
          if (miss.length === 1) crit.add(miss[0]);
        });
      }
      return crit;
    },

    /** Giá trị phòng thủ khi chiếm ô i (ngăn đối thủ tiến gần chiến thắng) */
    threatOf(i, me) {
      let v = 0;
      const t = TILES[i];
      for (const o of alivePlayers()) {
        if (o.id === me) continue;
        if (AI.critical(o.id).has(i)) v = Math.max(v, 100);
        if (t.type === 'resort' && resortCount(o.id) >= 2) v = Math.max(v, 30);
        const side = SIDE_TILES[sideOf(i)];
        if (side.filter((j) => state.props[j].owner === o.id).length >= 4) v = Math.max(v, 30);
        if (t.type === 'city') {
          const g = t.group;
          if (groupCount(g, o.id) === GROUP_TILES[g].length - 1 && completedGroups(o.id) >= 1) v = Math.max(v, 35);
        }
      }
      return v;
    },

    /** Giá trị phát triển của mình khi chiếm ô i */
    gainOf(i, me) {
      const t = TILES[i];
      let v = 0;
      if (t.type === 'resort') {
        v += 15 + resortCount(me) * 22;
      } else {
        const g = t.group;
        const have = groupCount(g, me);
        const total = GROUP_TILES[g].length;
        const others = GROUP_TILES[g].some((j) => j !== i && state.props[j].owner != null && state.props[j].owner !== me);
        if (have === total - 1 && state.props[i].owner !== me) v += 50;
        else if (have > 0 && !others) v += 18;
        else if (!others) v += 8;
      }
      v += SIDE_TILES[sideOf(i)].filter((j) => state.props[j].owner === me).length * 5;
      return v;
    },

    /** Mua lại ô i của X sẽ phá thế độc quyền của X tới mức nào */
    disruptOf(i, X) {
      if (X == null) return 0;
      const t = TILES[i];
      let v = 0;
      const sc = SIDE_TILES[sideOf(i)].filter((j) => state.props[j].owner === X).length;
      if (sc >= 5) v = Math.max(v, 100);
      else if (sc === 4) v = Math.max(v, 35);
      if (t.type === 'city') {
        const comp = completedGroups(X);
        const g = t.group;
        const gc = groupCount(g, X);
        const total = GROUP_TILES[g].length;
        if (gc === total) v = Math.max(v, comp >= 2 ? 90 : 30);
        else if (gc === total - 1 && comp >= 2) v = Math.max(v, 70);
      }
      return v;
    },

    purchaseLevel(p, i, opts) {
      if (!opts.length) return 0;
      if (AI.critical(p.id).has(i)) return opts[0].level;
      const reserve = AI.reserve(p);
      const block = AI.threatOf(i, p.id);
      const gainV = AI.gainOf(i, p.id);
      let keep = reserve;
      if (block >= 100) keep = reserve * 0.2;
      else if (gainV >= 50) keep = reserve * 0.55;
      else if (block >= 30) keep = reserve * 0.7;
      const ok = opts.filter((o) => p.money - o.cost >= keep);
      if (!ok.length) return 0;
      let best = ok[ok.length - 1].level;
      const unowned = PROP_TILES.filter((j) => state.props[j].owner == null).length;
      if (unowned > PROP_TILES.length * 0.4 && gainV < 50) best = Math.min(best, p.money > state.startMoney ? 2 : 1);
      return best;
    },

    wantResort(p, i) {
      if (AI.critical(p.id).has(i)) return true;
      const left = p.money - RESORT_PRICE;
      if (AI.threatOf(i, p.id) >= 100) return left >= 0;
      return left >= AI.reserve(p) * 0.75;
    },

    upgradeLevel(p, i, opts) {
      const reserve = AI.reserve(p);
      const lm = opts.find((o) => o.level === 4);
      if (lm) return p.money - lm.cost >= reserve * 0.55 ? 4 : 0;
      let best = 0;
      for (const o of opts) if (p.money - o.cost >= reserve) best = o.level;
      return best;
    },

    wantBuyout(p, i, cost) {
      if (p.money < cost) return false;
      if (AI.critical(p.id).has(i)) return true;
      const reserve = AI.reserve(p);
      const left = p.money - cost;
      const disrupt = AI.disruptOf(i, state.props[i].owner);
      if (disrupt >= 90 && left >= reserve * 0.3) return true;
      if (disrupt >= 60 && left >= reserve * 0.6) return true;
      if (AI.gainOf(i, p.id) >= 50 && left >= reserve * 0.9) return true;
      if (left >= reserve * 1.8 + 300 && rand() < 0.6) return true;
      return false;
    },

    islandChoice(p, canPay) {
      const unowned = PROP_TILES.filter((j) => state.props[j].owner == null).length;
      let danger = 0;
      for (const j of PROP_TILES) {
        const o = state.props[j].owner;
        if (o != null && o !== p.id) danger += rentOf(j);
      }
      danger /= TILE_COUNT;
      const wantLeave = unowned >= 4 && danger < p.money * 0.06;
      if (!wantLeave) return 'roll';
      if (p.escape > 0) return 'card';
      if (canPay && p.money - ISLAND_FEE >= AI.reserve(p) + 100) return 'pay';
      return 'roll';
    },

    tourTarget(p) {
      if (p.money < TOUR_FEE) return null;
      const reserve = AI.reserve(p);
      const money = p.money - TOUR_FEE;
      const myCrit = AI.critical(p.id);
      const hasUpgradable = citiesOf(p.id).some((i) => state.props[i].level < 3);
      let best = null;
      let bestScore = 20;
      for (let j = 0; j < TILE_COUNT; j++) {
        if (j === TOUR_TILE) continue;
        const t = TILES[j];
        const pr = state.props[j];
        const passStartBonus = j < TOUR_TILE;
        const cash = money + (passStartBonus ? START_SALARY : 0);
        let s = passStartBonus ? 25 : 0;
        if (t.type === 'city' || t.type === 'resort') {
          if (pr.owner == null) {
            const price = t.type === 'resort' ? RESORT_PRICE : t.eco.value[1];
            if (price <= cash) {
              if (myCrit.has(j)) s += 1000;
              else s += 30 + AI.gainOf(j, p.id) + AI.threatOf(j, p.id) * 0.8 - (cash - price < reserve ? 25 : 0);
            } else {
              s -= 10;
            }
          } else if (pr.owner === p.id) {
            if (t.type === 'city') {
              if (pr.level === 3 && t.eco.costs[4] <= cash - reserve * 0.6) s += 70;
              else if (pr.level < 3 && t.eco.costs[pr.level + 1] <= cash - reserve) s += 25;
              else s += 5;
            } else {
              s += 5;
            }
          } else {
            const rent = rentOf(j);
            s -= rent * 0.5;
            const canBuyout = t.type === 'city' && pr.level < 4;
            if (myCrit.has(j) && canBuyout && cash - rent >= buyoutCost(j)) s += 900;
          }
        } else if (t.type === 'start') {
          s += 35 + (hasUpgradable ? 15 : 0);
        } else if (t.type === 'chance') {
          s += 12;
        } else if (t.type === 'festival') {
          s += citiesOf(p.id).length ? 40 : 0;
        } else if (t.type === 'island') {
          s -= 40;
        } else if (t.type === 'tax') {
          s -= cash * TAX_RATE * 0.5;
        }
        if (s > bestScore) {
          bestScore = s;
          best = j;
        }
      }
      return best;
    },

    festivalTarget(p, cands) {
      return cands.slice().sort((a, b) => baseRent(b) - baseRent(a) || state.props[b].level - state.props[a].level)[0];
    },

    startTarget(p, cands) {
      const reserve = AI.reserve(p);
      let best = null;
      let bestScore = 0;
      for (const i of cands) {
        const t = TILES[i];
        const L = state.props[i].level;
        const cost = t.eco.costs[L + 1];
        if (p.money - cost < reserve * 0.8) continue;
        const score = (t.eco.rents[L + 1] - t.eco.rents[L]) / cost + (groupComplete(t.group, p.id) ? 0.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      return best;
    },

    freeUpgradeTarget(p, cands) {
      const gainOf = (i) => {
        const L = state.props[i].level;
        return TILES[i].eco.rents[L + 1] - TILES[i].eco.rents[L] + (state.festival.tile === i ? 1000 : 0);
      };
      return cands.slice().sort((a, b) => gainOf(b) - gainOf(a))[0];
    },

    sellHouseTarget(p, cands) {
      const loss = (i) => {
        const L = state.props[i].level;
        const t = TILES[i];
        return t.eco.rents[L] - t.eco.rents[L - 1] + (L === 1 ? 500 + (groupComplete(t.group, p.id) ? 500 : 0) : 0);
      };
      return cands.slice().sort((a, b) => loss(a) - loss(b))[0];
    },

    evictTarget(p, cands) {
      const score = (i) => AI.disruptOf(i, state.props[i].owner) * 10 + propValue(i) + (AI.gainOf(i, p.id) >= 50 ? 300 : 0);
      return cands.slice().sort((a, b) => score(b) - score(a))[0];
    },

    sellOrder(p) {
      const keep = (i) => {
        const t = TILES[i];
        const pr = state.props[i];
        let s = propValue(i);
        if (t.type === 'resort') {
          s += 70 * resortCount(p.id);
        } else {
          if (groupComplete(t.group, p.id)) s += 260;
          if (pr.level === 4) s += 420;
          if (state.festival.tile === i) s += 220;
        }
        return s;
      };
      return ownedBy(p.id).sort((a, b) => keep(a) - keep(b));
    },

    useShield(p, rent) {
      return rent >= 120 || rent > p.money * 0.35;
    },
  };

  // ===================================================================
  // 9. GIAO DIỆN — DỰNG & HIỂN THỊ
  // ===================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  const dom = {};
  let tileEls = [];
  let tokenEls = [];
  let cardEls = [];
  let selectHandler = null;
  const hoverCapable = () => window.matchMedia && window.matchMedia('(hover: hover)').matches;

  function cacheDom() {
    dom.board = $('#board');
    dom.center = $('#center');
    dom.dock = $('#dock');
    dom.tokens = $('#token-layer');
    dom.diceRow = $('#dice-row');
    dom.status = $('#stage-status');
    dom.actions = $('#stage-actions');
    dom.hint = $('#stage-hint');
    dom.logPanel = $('#log-panel');
    dom.log = $('#log');
    dom.roundPill = $('#round-pill');
    dom.festPill = $('#festival-pill');
    dom.inflPill = $('#inflation-pill');
    dom.tooltip = $('#tooltip');
    dom.toasts = $('#toast-root');
    dom.modalRoot = $('#modal-root');
    dom.setup = $('#setup');
  }

  function sideClass(i) {
    if (i % 8 === 0) return 'corner';
    return `s${Math.floor(i / 8)}`;
  }

  function tileHTML(t) {
    const nameCls = t.name.length >= 9 ? 'name long' : 'name';
    switch (t.type) {
      case 'city':
        return `<div class="band"><span class="lvl"></span></div><div class="body"><div class="${nameCls}">${esc(t.name)}</div><div class="price"></div></div><div class="owner-badge"></div><div class="fest-badge"></div>`;
      case 'resort':
        return `<div class="band band-resort"><span class="lvl">🏖️</span></div><div class="body"><div class="${nameCls}">${esc(t.name)}</div><div class="price"></div></div><div class="owner-badge"></div>`;
      case 'chance':
        return `<div class="body"><div class="icon">${t.icon}</div><div class="name">${t.name}</div></div>`;
      case 'tax':
        return `<div class="body"><div class="icon">${t.icon}</div><div class="name">${t.name}</div><div class="sub">${t.sub}</div></div>`;
      default:
        return `<div class="corner-body"><div class="icon">${t.icon}</div><div class="name">${t.label}</div><div class="sub">${t.sub}</div></div>`;
    }
  }

  function buildBoard() {
    tileEls.forEach((e) => e.remove());
    tileEls = TILES.map((t, i) => {
      const { row, col } = gridPos(i);
      const e = el('div', `tile t-${t.type} ${sideClass(i)}`);
      e.dataset.i = String(i);
      e.style.gridRow = String(row);
      e.style.gridColumn = String(col);
      if (t.type === 'city') e.style.setProperty('--g', GROUPS[t.group].color);
      e.setAttribute('role', 'button');
      e.setAttribute('aria-label', t.name);
      e.innerHTML = tileHTML(t);
      e.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onTileClick(i);
      });
      e.addEventListener('mouseenter', () => {
        if (hoverCapable()) showTooltip(i);
      });
      e.addEventListener('mouseleave', () => {
        if (hoverCapable()) hideTooltip();
      });
      dom.board.insertBefore(e, dom.center);
      return e;
    });
  }

  // ---------- Xúc xắc 3D ----------
  const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  const diceSpin = [0, 0];

  function buildDice() {
    [0, 1].forEach((k) => {
      const cube = $(`#cube-${k}`);
      cube.innerHTML = '';
      for (let f = 1; f <= 6; f++) {
        const face = el('div', `face f${f}`);
        for (let c = 0; c < 9; c++) {
          const on = PIP_LAYOUT[f].includes(c);
          face.appendChild(el('span', on ? `pip${f === 1 || f === 4 ? ' red' : ''}` : 'nopip'));
        }
        cube.appendChild(face);
      }
    });
  }

  function setDiceFaces(vals, animate) {
    vals.forEach((v, k) => {
      const cube = $(`#cube-${k}`);
      if (!cube) return;
      if (animate) diceSpin[k] += 2 + Math.floor(Math.random() * 2);
      const [rx, ry] = FACE_ROT[v] || FACE_ROT[1];
      if (!animate) cube.style.transition = 'none';
      cube.style.transform = `rotateX(${rx + 360 * diceSpin[k]}deg) rotateY(${ry + 360 * (diceSpin[k] + k)}deg)`;
      if (!animate) {
        void cube.offsetWidth;
        cube.style.transition = '';
      }
    });
  }

  async function animateDice(d1, d2) {
    const ms = S().dice;
    dom.diceRow.classList.remove('double', 'rolling');
    if (ms > 0) {
      void dom.diceRow.offsetWidth;
      dom.diceRow.classList.add('rolling');
      Sound.dice();
    }
    setDiceFaces([d1, d2], ms > 0);
    await sleep(ms);
    if (ms > 0) Sound.diceLand();
    dom.diceRow.classList.remove('rolling');
    if (d1 === d2) dom.diceRow.classList.add('double');
  }

  // ---------- Thẻ người chơi ----------
  function buildCards() {
    cardEls.forEach((e) => e.remove());
    cardEls = [];
    for (let slot = 0; slot < 4; slot++) {
      const p = state ? state.players[slot] : null;
      const c = el('div', `pcard pslot-${slot}`);
      if (!p) {
        c.classList.add('empty');
        c.innerHTML = '<div class="pc-empty">Ghế trống</div>';
      } else {
        c.style.setProperty('--pc', p.color);
        c.innerHTML = `
          <div class="pc-top">
            <div class="pc-avatar">${esc(p.avatar)}</div>
            <div class="pc-id">
              <div class="pc-name">${esc(p.name)}</div>
              <div class="pc-type">${isBot(p) ? '🤖 Máy' : '👤 Người chơi'}</div>
            </div>
            <div class="pc-turn" aria-hidden="true">▶</div>
          </div>
          <div class="pc-money" data-v="${p.money}">${fmtFull(p.money)}</div>
          <div class="pc-sub"><span class="pc-props"></span><span class="pc-worth"></span></div>
          <div class="pc-status"></div>`;
        c.title = 'Xem tài sản';
        c.addEventListener('click', () => showPlayerInfo(p.id));
      }
      cardEls.push(c);
    }
    placeCards();
  }

  function placeCards() {
    const compact = document.body.classList.contains('compact');
    const target = compact ? dom.dock : dom.center;
    cardEls.forEach((c) => target.appendChild(c));
    target.appendChild(dom.logPanel);
  }

  function animateMoney(node, value) {
    const from = Number(node.dataset.v);
    cancelAnimationFrame(node._raf);
    if (!Number.isFinite(from) || from === value || S().fx === 0) {
      node.dataset.v = String(value);
      node.textContent = fmtFull(value);
      return;
    }
    node.classList.remove('up', 'down');
    void node.offsetWidth;
    node.classList.add(value > from ? 'up' : 'down');
    const t0 = performance.now();
    const dur = 600;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(from + (value - from) * e);
      node.dataset.v = String(v);
      node.textContent = fmtFull(v);
      if (k < 1) node._raf = requestAnimationFrame(step);
    };
    node._raf = requestAnimationFrame(step);
  }

  function renderPlayers() {
    if (!state) return;
    state.players.forEach((p) => {
      const c = cardEls[p.id];
      if (!c) return;
      c.classList.toggle('active', state.status === 'playing' && state.current === p.id);
      c.classList.toggle('bankrupt', p.bankrupt);
      c.classList.toggle('winner', state.winner === p.id);
      animateMoney(c.querySelector('.pc-money'), p.money);
      const props = ownedBy(p.id);
      const cities = props.filter((i) => TILES[i].type === 'city').length;
      c.querySelector('.pc-props').textContent = `🏠 ${cities} · 🏖️ ${props.length - cities}`;
      c.querySelector('.pc-worth').textContent = `Tài sản ${fmt(netWorth(p))}`;
      const st = [];
      if (p.bankrupt) st.push('<span class="chip chip-bad">💀 Phá sản</span>');
      if (p.island > 0) st.push(`<span class="chip" title="Đang kẹt trên Đảo Hoang">🏝️ ${p.island}</span>`);
      if (p.tour) st.push('<span class="chip" title="Lượt sau được bay">✈️ Bay</span>');
      if (p.freeRent > 0) st.push(`<span class="chip" title="Thẻ Miễn Thuê">🛡️ ${p.freeRent}</span>`);
      if (p.escape > 0) st.push(`<span class="chip" title="Thuyền Cứu Hộ">🛶 ${p.escape}</span>`);
      const g = completedGroups(p.id);
      if (g > 0) st.push(`<span class="chip chip-gold" title="Số nhóm màu độc quyền">🎨 ${g}/3</span>`);
      const rc = resortCount(p.id);
      if (rc >= 2) st.push(`<span class="chip chip-sea" title="Khu nghỉ dưỡng">🏖️ ${rc}/4</span>`);
      c.querySelector('.pc-status').innerHTML = st.join('');
    });
  }

  function renderTiles() {
    TILES.forEach((t, i) => {
      const e = tileEls[i];
      if (!e || (t.type !== 'city' && t.type !== 'resort')) return;
      const pr = state ? state.props[i] : null;
      const owner = pr && pr.owner != null ? state.players[pr.owner] : null;
      e.classList.toggle('owned', !!owner);
      e.classList.toggle('landmark', !!owner && t.type === 'city' && pr.level === 4);
      if (owner) e.style.setProperty('--owner', owner.color);
      else e.style.removeProperty('--owner');
      e.querySelector('.owner-badge').textContent = owner ? owner.avatar : '';
      if (t.type === 'city') e.querySelector('.lvl').textContent = owner ? LEVEL_ICONS[pr.level] : '';
      const price = e.querySelector('.price');
      if (owner) {
        price.textContent = fmt(rentOf(i));
        price.classList.add('rent');
      } else {
        price.textContent = fmt(t.type === 'resort' ? RESORT_PRICE : t.eco.value[1]);
        price.classList.remove('rent');
      }
      if (t.type === 'city') {
        const fest = !!state && state.festival.tile === i;
        e.classList.toggle('festival', fest);
        e.querySelector('.fest-badge').textContent = fest ? `🎉x${state.festival.mult}` : '';
      }
    });
  }

  function renderHead() {
    if (!dom.roundPill) return;
    dom.roundPill.textContent = state ? `Vòng ${state.round}${state.maxRounds ? ` / ${state.maxRounds}` : ''}` : 'Vòng 1';
    const f = state && state.festival;
    if (f && f.tile != null) {
      dom.festPill.classList.remove('hidden');
      dom.festPill.textContent = `🎉 ${TILES[f.tile].name} x${f.mult}`;
    } else {
      dom.festPill.classList.add('hidden');
    }
    const inf = inflation();
    dom.inflPill.classList.toggle('hidden', inf <= 1);
    if (inf > 1) dom.inflPill.textContent = `📈 Lạm phát +${Math.round((inf - 1) * 100)}%`;
  }

  function renderLog() {
    if (!dom.log) return;
    if (!state) {
      dom.log.innerHTML = '';
      return;
    }
    dom.log.innerHTML = state.log
      .slice(0, 70)
      .map((e) => (e.k === 'round' ? `<li class="lg lg-round"><span>${e.h}</span></li>` : `<li class="lg${e.k ? ` lg-${e.k}` : ''}"><span class="lg-r">V${e.r}</span><span class="lg-t">${e.h}</span></li>`))
      .join('');
    dom.log.scrollTop = 0;
  }

  function renderAll() {
    renderTiles();
    renderPlayers();
    renderHead();
  }

  // ---------- Token ----------
  function buildTokens() {
    dom.tokens.innerHTML = '';
    tokenEls = state.players.map((p) => {
      const t = el('div', 'token');
      t.style.setProperty('--pc', p.color);
      t.innerHTML = `<div class="token-inner"><span>${esc(p.avatar)}</span></div>`;
      dom.tokens.appendChild(t);
      return t;
    });
    layoutTokens(true);
  }

  function layoutTokens(instant = false) {
    if (!state || !tokenEls.length) return;
    const occ = {};
    state.players.forEach((p) => {
      if (!p.bankrupt) (occ[p.pos] = occ[p.pos] || []).push(p.id);
    });
    state.players.forEach((p) => {
      const tk = tokenEls[p.id];
      if (!tk) return;
      tk.classList.toggle('gone', p.bankrupt);
      tk.classList.toggle('active', state.status === 'playing' && state.current === p.id);
      if (p.bankrupt) return;
      const te = tileEls[p.pos];
      const list = occ[p.pos];
      const k = list.indexOf(p.id);
      const n = list.length;
      const w = te.offsetWidth;
      const h = te.offsetHeight;
      const d = Math.min(w, h) * 0.21;
      let ox = 0;
      let oy = 0;
      if (n === 2) ox = k === 0 ? -d : d;
      else if (n >= 3) {
        ox = k % 2 === 0 ? -d : d;
        oy = k < 2 ? -d : d;
      }
      const x = te.offsetLeft + w / 2 + ox;
      const y = te.offsetTop + h / 2 + oy;
      if (instant) tk.style.transition = 'none';
      tk.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (instant) {
        void tk.offsetWidth;
        tk.style.transition = '';
      }
    });
  }

  function hopToken(p) {
    const tk = tokenEls[p.id];
    if (!tk || S().fx === 0) return;
    tk.classList.remove('hop');
    void tk.offsetWidth;
    tk.classList.add('hop');
  }
  function flyToken(p) {
    const tk = tokenEls[p.id];
    if (tk && S().fly > 0) tk.classList.add('flying');
    layoutTokens();
  }
  function landToken(p) {
    const tk = tokenEls[p.id];
    if (tk) tk.classList.remove('flying');
  }

  // ===================================================================
  // 10. GIAO DIỆN — TƯƠNG TÁC & HIỆU ỨNG
  // ===================================================================
  function setStatus(html) {
    if (dom.status) dom.status.innerHTML = html;
  }
  function clearActions() {
    if (dom.actions) dom.actions.innerHTML = '';
    if (dom.hint) dom.hint.textContent = '';
  }

  /** Hiển thị các nút hành động ở giữa bàn cờ và chờ người chơi bấm */
  function stageActions({ status, buttons, hint = '' }) {
    return humanWait((done) => {
      if (status != null) setStatus(status);
      dom.actions.innerHTML = '';
      dom.hint.textContent = hint;
      buttons.forEach((b) => {
        const btn = el('button', `btn btn-${b.style || 'ghost'}${b.big ? ' btn-big' : ''}`, b.label);
        btn.type = 'button';
        if (b.disabled) btn.disabled = true;
        if (b.hotkey) btn.dataset.hotkey = '1';
        btn.addEventListener('click', () => {
          Sound.unlock();
          Sound.click();
          clearActions();
          done(b.value);
        });
        dom.actions.appendChild(btn);
      });
    });
  }

  /** Chế độ chọn ô trên bàn cờ (Lễ Hội, Chuyến Bay, nâng cấp…) */
  function selectTile(p, cands, { title, cancelLabel = null }) {
    return humanWait((done) => {
      const set = new Set(cands);
      dom.board.classList.add('selecting');
      tileEls.forEach((e, i) => e.classList.toggle('selectable', set.has(i)));
      setStatus(`<div class="select-title">${title}</div>`);
      dom.actions.innerHTML = '';
      dom.hint.textContent = '👆 Nhấn vào ô đang phát sáng trên bàn cờ';
      const finish = (v) => {
        selectHandler = null;
        clearSelection();
        clearActions();
        setStatus('');
        done(v);
      };
      selectHandler = (i) => {
        if (!set.has(i)) return false;
        Sound.click();
        finish(i);
        return true;
      };
      if (cancelLabel) {
        const b = el('button', 'btn btn-ghost', cancelLabel);
        b.type = 'button';
        b.addEventListener('click', () => {
          Sound.click();
          finish(null);
        });
        dom.actions.appendChild(b);
      }
    });
  }

  function clearSelection() {
    if (!dom.board) return;
    dom.board.classList.remove('selecting');
    tileEls.forEach((e) => e.classList.remove('selectable'));
  }

  function onTileClick(i) {
    if (selectHandler) {
      hideTooltip();
      if (selectHandler(i)) return;
    }
    if (dom.tooltip.classList.contains('show') && dom.tooltip.dataset.i === String(i) && !hoverCapable()) {
      hideTooltip();
      return;
    }
    showTooltip(i);
  }

  async function flashTile(i) {
    const e = tileEls[i];
    if (!e) return;
    e.classList.add('chosen');
    try {
      await sleep(Math.max(S().bot, 0));
    } finally {
      e.classList.remove('chosen');
    }
  }

  function pulseTile(i) {
    const e = tileEls[i];
    if (!e || S().fx === 0) return;
    e.classList.remove('pulse');
    void e.offsetWidth;
    e.classList.add('pulse');
    setTimeout(() => e.classList.remove('pulse'), 800);
  }

  function tileFx(i, html, kind = '') {
    const te = tileEls[i];
    if (!te || S().fx === 0) return;
    const fx = el('div', `tile-fx ${kind}`, html);
    fx.style.left = `${te.offsetLeft + te.offsetWidth / 2}px`;
    fx.style.top = `${te.offsetTop + te.offsetHeight / 2}px`;
    dom.board.appendChild(fx);
    setTimeout(() => fx.remove(), 1500);
  }

  function moneyFx(p, delta) {
    const c = cardEls[p.id];
    if (!c || !delta || S().fx === 0) return;
    const fx = el('div', `money-fx ${delta > 0 ? 'gain' : 'loss'}`, `${delta > 0 ? '+' : '−'}${fmtFull(Math.abs(delta))}`);
    c.appendChild(fx);
    setTimeout(() => fx.remove(), 1500);
  }

  async function banner(p, sub) {
    const ms = S().banner;
    if (!ms) return;
    const b = el('div', 'turn-banner', `<div class="tb-avatar">${esc(p.avatar)}</div><div><div class="tb-title">Lượt của ${esc(p.name)}</div><div class="tb-sub">${sub}</div></div>`);
    b.style.setProperty('--pc', p.color);
    dom.board.appendChild(b);
    try {
      await sleep(ms);
    } finally {
      b.classList.add('out');
      setTimeout(() => b.remove(), 350);
    }
  }

  function toast(html, kind = 'info', ms = 2600) {
    if (!dom.toasts) return;
    const t = el('div', `toast toast-${kind}`, html);
    dom.toasts.appendChild(t);
    while (dom.toasts.children.length > 4) dom.toasts.firstElementChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  function confetti() {
    const wrap = el('div', 'confetti');
    const colors = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#fbbf24', '#06b6d4'];
    for (let k = 0; k < 90; k++) {
      const c = el('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[k % colors.length];
      c.style.animationDelay = `${Math.random() * 1.2}s`;
      c.style.animationDuration = `${2.4 + Math.random() * 2}s`;
      c.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      c.style.setProperty('--dx', `${Math.random() * 200 - 100}px`);
      wrap.appendChild(c);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 5200);
  }

  // ---------- Tooltip thông tin ô ----------
  function showTooltip(i) {
    const tip = dom.tooltip;
    tip.innerHTML = tileInfoHTML(i);
    tip.dataset.i = String(i);
    tip.classList.add('show');
    const r = tileEls[i].getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const gap = 8;
    let x;
    let y;
    const side = i % 8 === 0 ? -1 : Math.floor(i / 8);
    if (side === 0) {
      x = r.right + gap;
      y = r.top + r.height / 2 - th / 2;
    } else if (side === 2) {
      x = r.left - tw - gap;
      y = r.top + r.height / 2 - th / 2;
    } else if (side === 1) {
      x = r.left + r.width / 2 - tw / 2;
      y = r.bottom + gap;
    } else if (side === 3) {
      x = r.left + r.width / 2 - tw / 2;
      y = r.top - th - gap;
    } else {
      x = i === 0 || i === 8 ? r.right + gap : r.left - tw - gap;
      y = i === 8 || i === 16 ? r.top + r.height / 2 : r.bottom - r.height / 2 - th;
    }
    x = Math.max(8, Math.min(W - tw - 8, x));
    y = Math.max(8, Math.min(H - th - 8, y));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function hideTooltip() {
    if (dom.tooltip) dom.tooltip.classList.remove('show');
  }

  function groupDots(g) {
    return GROUP_TILES[g]
      .map((j) => {
        const o = state ? state.props[j].owner : null;
        const c = o != null ? state.players[o].color : 'transparent';
        return `<span class="gdot" style="--c:${c}" title="${esc(TILES[j].name)}"></span>`;
      })
      .join('');
  }

  function tileInfoHTML(i) {
    const t = TILES[i];
    const pr = state ? state.props[i] : null;
    const owner = pr && pr.owner != null ? state.players[pr.owner] : null;
    if (t.type === 'city') {
      const g = GROUPS[t.group];
      const rows = [1, 2, 3, 4]
        .map((L) => `<tr class="${owner && pr.level === L ? 'cur' : ''}${L === 4 ? ' lm' : ''}"><td>${LEVEL_ICONS[L]} ${L === 4 ? 'Biểu Tượng' : `Cấp ${L}`}</td><td>${L === 1 ? fmtFull(t.eco.costs[1]) : `+${fmtFull(t.eco.costs[L])}`}</td><td>${fmtFull(t.eco.rents[L])}</td></tr>`)
        .join('');
      let status;
      if (owner) {
        const fest = (state.festival.tile === i ? ` <span class="tt-fest">🎉x${state.festival.mult}</span>` : '') + (inflation() > 1 ? ` <span class="tt-infl">📈+${Math.round((inflation() - 1) * 100)}%</span>` : '');
        status = `<div class="tt-owner" style="--pc:${owner.color}">${esc(owner.avatar)} ${esc(owner.name)} · ${LEVEL_ICONS[pr.level]} ${LEVEL_NAMES[pr.level]}</div>
          <div class="tt-line">💰 Tiền thuê hiện tại: <b>${fmtFull(rentOf(i))}</b>${fest}</div>
          <div class="tt-line">${pr.level >= 4 ? '🔒 Biểu Tượng — không thể bị mua lại' : `💥 Giá mua lại: <b>${fmtFull(buyoutCost(i))}</b>`}</div>
          <div class="tt-line">💱 Bán cho ngân hàng: ${fmtFull(sellValue(i))}</div>`;
      } else {
        status = `<div class="tt-line">🏷️ Chưa có chủ — giá từ <b>${fmtFull(t.eco.value[1])}</b></div>`;
      }
      return `<div class="tt-head" style="--g:${g.color}"><div class="tt-group">${esc(g.name)} <span class="gdots">${groupDots(t.group)}</span></div><div class="tt-name">${esc(t.name)}</div></div>
        ${status}
        <table class="tt-table"><thead><tr><th>Công trình</th><th>Chi phí</th><th>Thuê</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (t.type === 'resort') {
      const cnt = owner ? resortCount(owner.id) : 0;
      const rows = [1, 2, 3, 4].map((n) => `<tr class="${owner && cnt === n ? 'cur' : ''}"><td>🏖️ Sở hữu ${n} khu</td><td>${fmtFull(RESORT_RENTS[n])}</td></tr>`).join('');
      const status = owner
        ? `<div class="tt-owner" style="--pc:${owner.color}">${esc(owner.avatar)} ${esc(owner.name)} · ${cnt}/4 khu</div><div class="tt-line">💰 Tiền thuê hiện tại: <b>${fmtFull(rentOf(i))}</b>${inflation() > 1 ? ` <span class="tt-infl">📈+${Math.round((inflation() - 1) * 100)}%</span>` : ''}</div><div class="tt-line">🔒 Khu nghỉ dưỡng không thể bị mua lại</div><div class="tt-line">💱 Bán cho ngân hàng: ${fmtFull(sellValue(i))}</div>`
        : `<div class="tt-line">🏷️ Chưa có chủ — giá <b>${fmtFull(RESORT_PRICE)}</b></div>`;
      return `<div class="tt-head tt-resort"><div class="tt-group">Khu Nghỉ Dưỡng · không xây nhà</div><div class="tt-name">🏖️ ${esc(t.name)}</div></div>${status}<table class="tt-table"><thead><tr><th>Số khu</th><th>Thuê</th></tr></thead><tbody>${rows}</tbody></table><div class="tt-desc">Không xây nhà, không thể bị mua lại. Sở hữu cả 4 khu = <b>Độc Quyền Du Lịch</b> (chiến thắng).</div>`;
    }
    let extra = '';
    if (t.type === 'festival' && state && state.festival.tile != null) {
      extra = `<div class="tt-line">Đang tổ chức tại <b>${esc(TILES[state.festival.tile].name)}</b> (x${state.festival.mult}) · đã tổ chức ${state.festival.editions} lần</div>`;
    }
    return `<div class="tt-head tt-special t-${t.type}"><div class="tt-name">${t.icon} ${esc(t.name)}</div></div><div class="tt-desc">${SPECIAL_DESC[t.type]}</div>${extra}`;
  }

  // ---------- Hộp thoại ----------
  function openModal({ icon = '', title = '', sub = '', html = '', buttons = [], cls = '', stack = false, auto = null, onMount = null }) {
    return humanWait((done) => {
      const bd = el('div', `modal-backdrop${auto ? ' passive' : ''}`);
      const card = el('div', `modal-card ${cls}`);
      const head = icon || title ? `<div class="modal-head">${icon ? `<div class="modal-icon">${icon}</div>` : ''}<div><div class="modal-title">${title}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ''}</div></div>` : '';
      card.innerHTML = `${head}<div class="modal-body">${html}</div>`;
      let closed = false;
      const close = (v) => {
        if (closed) return;
        closed = true;
        bd.classList.add('closing');
        setTimeout(() => bd.remove(), 180);
        done(v);
      };
      if (buttons.length) {
        const acts = el('div', `modal-actions${stack ? ' stack' : ''}`);
        buttons.forEach((b) => {
          const btn = el('button', `btn btn-${b.style || 'ghost'}`, b.label);
          btn.type = 'button';
          if (b.disabled) btn.disabled = true;
          if (b.hotkey) btn.dataset.hotkey = '1';
          btn.addEventListener('click', () => {
            Sound.unlock();
            Sound.click();
            close(b.value);
          });
          acts.appendChild(btn);
        });
        card.appendChild(acts);
      }
      bd.appendChild(card);
      dom.modalRoot.appendChild(bd);
      if (onMount) onMount(card, close);
      if (auto) setTimeout(() => close(auto.value), auto.ms);
    });
  }

  function deedHTML(i) {
    const t = TILES[i];
    const g = GROUPS[t.group];
    const pr = state.props[i];
    const owned = pr.owner != null;
    const rows = [1, 2, 3, 4]
      .map((L) => `<tr class="${owned && pr.level === L ? 'cur' : ''}${L === 4 ? ' lm' : ''}"><td>${LEVEL_ICONS[L]} ${LEVEL_NAMES[L]}</td><td>${L === 1 ? fmtFull(t.eco.costs[1]) : `+${fmtFull(t.eco.costs[L])}`}</td><td><b>${fmtFull(t.eco.rents[L])}</b></td></tr>`)
      .join('');
    let fest = state.festival.tile === i ? `<div class="deed-fest">🎉 Đang tổ chức Lễ Hội — tiền thuê x${state.festival.mult}</div>` : '';
    if (inflation() > 1) fest += `<div class="deed-fest deed-infl">📈 Lạm phát: tiền thuê thực tế +${Math.round((inflation() - 1) * 100)}% so với bảng</div>`;
    return `<div class="deed" style="--g:${g.color}">
      <div class="deed-head"><div class="deed-group">${esc(g.name)} <span class="gdots">${groupDots(t.group)}</span></div><div class="deed-name">${esc(t.name)}</div></div>
      <table class="deed-table"><thead><tr><th>Công trình</th><th>Chi phí</th><th>Tiền thuê</th></tr></thead><tbody>${rows}</tbody></table>
      ${fest}
    </div>`;
  }

  function resortDeedHTML(i) {
    const pr = state.props[i];
    const cnt = pr.owner != null ? resortCount(pr.owner) : 0;
    const rows = [1, 2, 3, 4].map((n) => `<tr class="${pr.owner != null && cnt === n ? 'cur' : ''}"><td>🏖️ Sở hữu ${n} khu</td><td><b>${fmtFull(RESORT_RENTS[n])}</b></td></tr>`).join('');
    return `<div class="deed deed-resort">
      <div class="deed-head"><div class="deed-group">Khu Nghỉ Dưỡng</div><div class="deed-name">🏖️ ${esc(TILES[i].name)}</div></div>
      <table class="deed-table"><thead><tr><th>Số khu cùng chủ</th><th>Tiền thuê</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function winNote(p, i) {
    return AI.critical(p.id).has(i) ? '<div class="win-note">🏆 Sở hữu ô này bạn sẽ <b>CHIẾN THẮNG</b> ngay lập tức!</div>' : '';
  }

  function purchaseDialog(p, i, options) {
    const t = TILES[i];
    return openModal({
      icon: '🏗️',
      title: `Mua đất ${esc(t.name)}`,
      sub: `${esc(GROUPS[t.group].name)} · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
      html: `${deedHTML(i)}${winNote(p, i)}<p class="hint">Lần mua đầu được xây tối đa đến Nhà cấp 3. Biểu Tượng 🗼 cần dừng lại đây thêm lần nữa.</p>`,
      stack: true,
      buttons: [
        ...options.map((o, k) => ({
          label: `<span>${LEVEL_ICONS[o.level]} Mua kèm ${LEVEL_NAMES[o.level]}</span><span class="btn-meta">${fmtFull(o.cost)} · thuê ${fmt(o.rent)}</span>`,
          value: o.level,
          style: k === 0 ? 'blue' : k === 1 ? 'green' : 'primary',
          disabled: o.cost > p.money,
        })),
        { label: 'Bỏ qua', value: 0, style: 'ghost' },
      ],
    });
  }

  function upgradeDialog(p, i, options, title) {
    const t = TILES[i];
    return openModal({
      icon: options.some((o) => o.level === 4) ? '🗼' : '🔨',
      title: `${esc(title)}: ${esc(t.name)}`,
      sub: `Hiện tại: ${LEVEL_ICONS[state.props[i].level]} ${LEVEL_NAMES[state.props[i].level]} · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
      html: `${deedHTML(i)}${options.some((o) => o.level === 4) ? '<p class="hint">🗼 Biểu Tượng tăng mạnh tiền thuê và <b>không thể bị mua lại</b>.</p>' : ''}`,
      stack: true,
      buttons: [
        ...options.map((o) => ({
          label: `<span>${LEVEL_ICONS[o.level]} Lên ${LEVEL_NAMES[o.level]}</span><span class="btn-meta">${fmtFull(o.cost)} · thuê ${fmt(o.rent)}</span>`,
          value: o.level,
          style: o.level === 4 ? 'gold' : 'green',
          disabled: o.cost > p.money,
        })),
        { label: 'Để sau', value: 0, style: 'ghost' },
      ],
    });
  }

  function buyoutDialog(p, i, cost) {
    const t = TILES[i];
    const owner = P(state.props[i].owner);
    return openModal({
      icon: '💥',
      title: `Mua lại ${esc(t.name)}?`,
      sub: `Chủ hiện tại: ${pn(owner)} · Tiền mặt của bạn: <b>${fmtFull(p.money)}</b>`,
      html: `${deedHTML(i)}${winNote(p, i)}<p>Trả gấp đôi giá trị hiện tại (<b>${fmtFull(cost)}</b>) cho ${pn(owner)} để sở hữu ngay thành phố này.</p><p class="hint">Sau khi mua lại bạn có thể nâng cấp tiếp (tối đa Nhà cấp 3).</p>`,
      buttons: [
        { label: 'Thôi', value: false, style: 'ghost' },
        { label: `💥 Mua lại ${fmtFull(cost)}`, value: true, style: 'primary' },
      ],
    });
  }

  function resortDialog(p, i) {
    const have = resortCount(p.id);
    return openModal({
      icon: '🏖️',
      title: `Mua Khu Nghỉ Dưỡng ${esc(TILES[i].name)}?`,
      sub: `Bạn đang có ${have}/4 khu · Tiền mặt: <b>${fmtFull(p.money)}</b>`,
      html: `${resortDeedHTML(i)}${winNote(p, i)}<p class="hint">Khu nghỉ dưỡng không xây nhà được. Tiền thuê tăng theo số khu cùng chủ.</p>`,
      buttons: [
        { label: 'Bỏ qua', value: false, style: 'ghost' },
        { label: `🏖️ Mua ${fmtFull(RESORT_PRICE)}`, value: true, style: 'primary' },
      ],
    });
  }

  function chanceDialog(p, card) {
    const html = `<div class="chance-card ${card.good ? 'good' : 'bad'}"><div class="cc-icon">${card.icon}</div><div class="cc-title">${esc(card.title)}</div><div class="cc-text">${esc(card.text)}</div></div>`;
    if (isBot(p)) {
      return openModal({ title: `🎁 ${esc(p.name)} rút thẻ Cơ Hội`, html, cls: 'modal-chance', auto: { ms: S().card, value: true } });
    }
    return openModal({
      title: '🎁 Thẻ Cơ Hội',
      html,
      cls: 'modal-chance',
      buttons: [{ label: 'OK, tiếp tục', value: true, style: 'primary', hotkey: true }],
    });
  }

  function sellRowHTML(i) {
    const t = TILES[i];
    const pr = state.props[i];
    const color = t.type === 'city' ? GROUPS[t.group].color : '#0ea5e9';
    const lvl = t.type === 'city' ? `${LEVEL_ICONS[pr.level]} ${LEVEL_NAMES[pr.level]}` : '🏖️ Khu nghỉ dưỡng';
    return `<div class="sell-row" style="--g:${color}"><span class="sell-band"></span><div class="sell-info"><div class="sell-name">${esc(t.name)}</div><div class="sell-meta">${lvl} · giá trị ${fmtFull(propValue(i))}</div></div><button type="button" class="btn btn-gold btn-sm" data-sell="${i}">Bán +${fmtFull(sellValue(i))}</button></div>`;
  }

  function sellDialog(p, amount, to) {
    return humanWait((done) => {
      const bd = el('div', 'modal-backdrop');
      const card = el('div', 'modal-card wide');
      bd.appendChild(card);
      dom.modalRoot.appendChild(bd);
      const render = () => {
        const props = ownedBy(p.id);
        const short = Math.max(0, amount - p.money);
        card.innerHTML = `
          <div class="modal-head"><div class="modal-icon">🆘</div><div><div class="modal-title">Không đủ tiền!</div><div class="modal-sub">${pn(p)} cần trả <b>${fmtFull(amount)}</b> ${to ? `cho ${pn(to)}` : 'cho ngân hàng'}</div></div></div>
          <div class="sell-summary"><div>Tiền mặt<b>${fmtFull(p.money)}</b></div><div>Còn thiếu<b class="${short ? 'neg' : 'pos'}">${fmtFull(short)}</b></div><div>Bán hết được<b>${fmtFull(liquidation(p))}</b></div></div>
          <p class="hint">Bán thành phố / khu nghỉ dưỡng cho ngân hàng (nhận lại 50% giá trị) cho tới khi đủ tiền thanh toán.</p>
          <div class="sell-list">${props.map(sellRowHTML).join('') || '<p class="hint">Không còn tài sản.</p>'}</div>
          <div class="modal-actions"><button type="button" class="btn btn-green" data-pay data-hotkey="1" ${short ? 'disabled' : ''}>✅ Thanh toán ${fmtFull(amount)}</button></div>`;
        card.querySelectorAll('[data-sell]').forEach((b) =>
          b.addEventListener('click', () => {
            sellProperty(p, Number(b.dataset.sell));
            render();
          })
        );
        card.querySelector('[data-pay]').addEventListener('click', () => {
          if (p.money < amount) return;
          Sound.click();
          bd.remove();
          done(true);
        });
      };
      render();
    });
  }

  function bankruptNotice(p, amount, to) {
    return openModal({
      icon: '💀',
      title: `${esc(p.name)} không thể trả nợ!`,
      html: `<p>Cần trả <b>${fmtFull(amount)}</b> nhưng toàn bộ tiền mặt cộng tài sản bán được chỉ có <b>${fmtFull(p.money + liquidation(p))}</b>.</p><p>Toàn bộ tài sản sẽ bị thanh lý${to ? ` và chuyển cho ${pn(to)}` : ''}.</p>`,
      buttons: [{ label: '💀 Chấp nhận phá sản', value: true, style: 'danger', hotkey: true }],
    });
  }

  function showPlayerInfo(pid) {
    if (!state || !state.players[pid]) return;
    const p = P(pid);
    const rows = ownedBy(pid)
      .map((i) => {
        const t = TILES[i];
        const pr = state.props[i];
        const color = t.type === 'city' ? GROUPS[t.group].color : '#0ea5e9';
        return `<div class="pi-row" style="--g:${color}"><span class="sell-band"></span><span class="pi-name">${esc(t.name)}</span><span class="pi-lvl">${t.type === 'city' ? LEVEL_ICONS[pr.level] : '🏖️'}</span><span class="pi-rent">thuê ${fmt(rentOf(i))}</span></div>`;
      })
      .join('');
    const cards = [];
    if (p.freeRent) cards.push(`🛡️ Thẻ Miễn Thuê x${p.freeRent}`);
    if (p.escape) cards.push(`🛶 Thuyền Cứu Hộ x${p.escape}`);
    openModal({
      icon: esc(p.avatar),
      title: esc(p.name),
      sub: `${isBot(p) ? '🤖 Máy' : '👤 Người chơi'} · Tiền mặt ${fmtFull(p.money)} · Tổng tài sản ${fmtFull(netWorth(p))}`,
      html: `<div class="pi-stats"><span>🎨 Nhóm màu độc quyền: <b>${completedGroups(pid)}/3</b></span><span>🏖️ Khu nghỉ dưỡng: <b>${resortCount(pid)}/4</b></span>${cards.length ? `<span>${cards.join(' · ')}</span>` : ''}</div><div class="pi-list">${rows || '<p class="hint">Chưa sở hữu tài sản nào.</p>'}</div>`,
      buttons: [{ label: 'Đóng', value: true, style: 'ghost', hotkey: true }],
    }).catch(() => {});
  }

  function standingsHTML() {
    const winner = state.winner;
    const list = [...state.players].sort((a, b) => {
      if (a.id === winner) return -1;
      if (b.id === winner) return 1;
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      if (!a.bankrupt) return netWorth(b) - netWorth(a);
      return state.out.indexOf(b.id) - state.out.indexOf(a.id);
    });
    return `<ol class="standings">${list
      .map((p, k) => `<li class="${p.id === winner ? 'win' : ''}" style="--pc:${p.color}"><span class="st-rank">${k === 0 ? '🥇' : k === 1 ? '🥈' : k === 2 ? '🥉' : '4'}</span><span class="st-av">${esc(p.avatar)}</span><span class="st-name">${esc(p.name)}</span><span class="st-val">${p.bankrupt ? `💀 Phá sản (vòng ${p.outRound})` : fmtFull(netWorth(p))}</span></li>`)
      .join('')}</ol>`;
  }

  function showGameOver(fresh) {
    if (!state || state.winner == null) return;
    const w = P(state.winner);
    const r = state.winReason || { icon: '🏆', label: 'Chiến thắng', desc: '' };
    if (fresh) confetti();
    const showNewBtn = () => {
      dom.actions.innerHTML = '';
      const b = el('button', 'btn btn-primary btn-big', '🔄 VÁN MỚI');
      b.type = 'button';
      b.dataset.hotkey = '1';
      b.addEventListener('click', () => showSetup());
      dom.actions.appendChild(b);
      setStatus(`🏆 ${pn(w)} chiến thắng — ${r.icon} ${esc(r.label)}`);
    };
    showNewBtn();
    openModal({
      icon: '🏆',
      title: `${esc(w.name)} CHIẾN THẮNG!`,
      sub: `${r.icon} ${esc(r.label)} — ${esc(r.desc)} · ${state.round} vòng`,
      cls: 'modal-win',
      html: `<div class="win-hero" style="--pc:${w.color}"><div class="win-av">${esc(w.avatar)}</div></div>${standingsHTML()}`,
      buttons: [
        { label: '👀 Xem bàn cờ', value: 'view', style: 'ghost' },
        { label: '🔄 Ván mới', value: 'new', style: 'primary', hotkey: true },
      ],
    })
      .then((v) => {
        if (v === 'new') showSetup();
        else showNewBtn();
      })
      .catch(() => {});
  }

  function showLogModal() {
    if (!state) return;
    const items = state.log
      .map((e) => (e.k === 'round' ? `<li class="lg lg-round"><span>${e.h}</span></li>` : `<li class="lg${e.k ? ` lg-${e.k}` : ''}"><span class="lg-r">V${e.r}</span><span class="lg-t">${e.h}</span></li>`))
      .join('');
    openModal({ icon: '📜', title: 'Nhật ký ván đấu', cls: 'wide', html: `<ol class="log-list log-modal">${items}</ol>`, buttons: [{ label: 'Đóng', value: true, style: 'ghost', hotkey: true }] }).catch(() => {});
  }

  const RULES_HTML = `
    <div class="rules">
      <h4>🎯 4 cách chiến thắng</h4>
      <ul>
        <li>🏆 <b>Người trụ lại cuối cùng</b> — mọi đối thủ đều phá sản.</li>
        <li>🎨 <b>Độc quyền 3 màu</b> — sở hữu trọn vẹn 3 nhóm màu thành phố bất kỳ.</li>
        <li>🛣️ <b>Độc quyền 1 cạnh</b> — sở hữu toàn bộ thành phố và khu nghỉ dưỡng trên cùng 1 cạnh bàn cờ.</li>
        <li>🏖️ <b>Độc quyền du lịch</b> — sở hữu cả 4 Khu Nghỉ Dưỡng.</li>
      </ul>
      <h4>🎲 Lượt chơi</h4>
      <ul>
        <li>Lắc 2 xúc xắc rồi đi theo chiều kim đồng hồ. Đổ <b>đôi</b> được lắc thêm lượt.</li>
        <li>Đổ đôi <b>3 lần liên tiếp</b> → bị đưa thẳng ra Đảo Hoang.</li>
      </ul>
      <h4>🏙️ Thành phố — 5 cấp</h4>
      <ul>
        <li>Cấp 0: đất trống (chưa có chủ). Cấp 1–3: 🏠 🏘️ 🏢. Cấp 4: 🗼 <b>Biểu Tượng</b>.</li>
        <li>Khi mua lần đầu hoặc dừng lại thành phố của mình: xây tối đa đến <b>Nhà cấp 3</b>.</li>
        <li>Biểu Tượng chỉ xây được khi đã có Nhà cấp 3 và <b>dừng lại ô đó lần nữa</b>.</li>
      </ul>
      <h4>💥 Mua lại (Hostile Takeover)</h4>
      <ul>
        <li>Dừng ở thành phố đối thủ (cấp 1–3): trả tiền thuê, sau đó được quyền trả <b>gấp đôi giá trị hiện tại</b> để mua đứt.</li>
        <li>Thành phố đã là <b>Biểu Tượng</b> thì <b>không thể</b> bị mua lại. Khu nghỉ dưỡng <b>không thể</b> bị mua lại.</li>
      </ul>
      <h4>⭐ Ô đặc biệt</h4>
      <ul>
        <li>🏁 <b>Bắt Đầu</b>: đi qua nhận $300K; dừng đúng ô được chọn nâng cấp 1 thành phố.</li>
        <li>🏝️ <b>Đảo Hoang</b>: kẹt 3 lượt. Thoát bằng đổ đôi, trả $200K hoặc thẻ Thuyền Cứu Hộ.</li>
        <li>🎉 <b>Lễ Hội Thế Giới</b>: chọn 1 thành phố của mình, tiền thuê x2 (các lần sau x3, x4). Mỗi lúc chỉ 1 thành phố tổ chức.</li>
        <li>✈️ <b>Chuyến Bay Thế Giới</b>: lượt sau trả $50K để bay tới bất kỳ ô nào.</li>
        <li>🏖️ <b>Khu Nghỉ Dưỡng</b> (4 ô): thuê $50K / $100K / $200K / $400K theo số khu sở hữu.</li>
        <li>🎁 <b>Cơ Hội</b>: rút thẻ ngẫu nhiên. 💸 <b>Thuế</b>: nộp 10% tiền mặt.</li>
      </ul>
      <h4>📈 Lạm phát</h4>
      <ul><li>Từ <b>vòng 41</b>, mọi tiền thuê tăng thêm <b>5% mỗi vòng</b> — giúp ván đấu luôn đi tới hồi kết.</li></ul>
      <h4>🆘 Phá sản</h4>
      <ul>
        <li>Không đủ tiền trả nợ: buộc bán bớt tài sản cho ngân hàng (nhận lại 50% giá trị) cho tới khi đủ.</li>
        <li>Bán hết vẫn không đủ → <b>phá sản</b>, toàn bộ tiền còn lại thuộc về chủ nợ.</li>
      </ul>
      <h4>💾 Lưu ván</h4>
      <ul><li>Ván chơi được tự động lưu vào trình duyệt ở đầu mỗi lượt lắc. Mở lại trang để chơi tiếp.</li></ul>
    </div>`;

  function showRules() {
    openModal({ icon: '📖', title: 'Luật chơi', cls: 'wide', html: RULES_HTML, buttons: [{ label: 'Đã hiểu!', value: true, style: 'primary', hotkey: true }] }).catch(() => {});
  }

  // ===================================================================
  // 11. THIẾT LẬP VÁN, THANH CÔNG CỤ, KHỞI ĐỘNG
  // ===================================================================
  const setupState = {
    slots: DEFAULT_SLOTS.map((s) => ({ ...s })),
    startMoney: 2000,
    maxRounds: 0,
  };

  function loadSetupFromSettings() {
    const s = settings.setup;
    if (!s) return;
    s.slots.forEach((slot, k) => {
      if (!slot) return;
      if (['human', 'bot', 'off'].includes(slot.type)) setupState.slots[k].type = slot.type;
      if (typeof slot.name === 'string') setupState.slots[k].name = slot.name.slice(0, 14);
      if (typeof slot.avatar === 'string' && AVATARS.includes(slot.avatar)) setupState.slots[k].avatar = slot.avatar;
    });
    if ([1500, 2000, 3000].includes(s.startMoney)) setupState.startMoney = s.startMoney;
    if ([0, 20, 30, 50].includes(s.maxRounds)) setupState.maxRounds = s.maxRounds;
  }

  function nextAvatar(k) {
    const used = new Set(setupState.slots.filter((s, j) => j !== k).map((s) => s.avatar));
    let idx = AVATARS.indexOf(setupState.slots[k].avatar);
    for (let n = 0; n < AVATARS.length; n++) {
      idx = (idx + 1) % AVATARS.length;
      if (!used.has(AVATARS[idx])) return AVATARS[idx];
    }
    return setupState.slots[k].avatar;
  }

  function renderSlots() {
    const wrap = $('#slots');
    wrap.innerHTML = '';
    setupState.slots.forEach((s, k) => {
      const c = el('div', `slot${s.type === 'off' ? ' off' : ''}`);
      c.style.setProperty('--pc', PLAYER_COLORS[k]);
      c.innerHTML = `
        <div class="slot-head"><span class="slot-dot"></span>Người chơi ${k + 1}</div>
        <div class="slot-main">
          <button type="button" class="slot-avatar" title="Đổi biểu tượng" aria-label="Đổi biểu tượng người chơi ${k + 1}">${s.avatar}</button>
          <input class="slot-name" maxlength="14" value="${esc(s.name)}" ${s.type === 'off' ? 'disabled' : ''} aria-label="Tên người chơi ${k + 1}" />
        </div>
        <div class="seg" role="group" aria-label="Loại người chơi">
          ${[['human', '👤 Người'], ['bot', '🤖 Máy'], ['off', '✖ Trống']].map(([v, l]) => `<button type="button" data-t="${v}" class="${s.type === v ? 'on' : ''}">${l}</button>`).join('')}
        </div>`;
      c.querySelector('.slot-avatar').addEventListener('click', () => {
        s.avatar = nextAvatar(k);
        Sound.click();
        renderSlots();
      });
      c.querySelector('.slot-name').addEventListener('input', (e) => {
        s.name = e.target.value;
      });
      c.querySelectorAll('.seg button').forEach((b) =>
        b.addEventListener('click', () => {
          s.type = b.dataset.t;
          Sound.click();
          renderSlots();
        })
      );
      wrap.appendChild(c);
    });
    const humans = setupState.slots.filter((s) => s.type === 'human').length;
    const active = setupState.slots.filter((s) => s.type !== 'off').length;
    $('#setup-mode').textContent =
      active < 2 ? '⚠️ Cần ít nhất 2 người chơi' : humans >= 2 ? `🤝 Pass & Play: ${humans} người chơi chung 1 máy${active > humans ? ` + ${active - humans} máy` : ''}` : humans === 1 ? `👤 1 người chơi + ${active - 1} máy` : `👀 Chế độ xem: ${active} máy đấu với nhau`;
  }

  function applyPreset(name) {
    const map = {
      solo: ['human', 'bot', 'bot', 'bot'],
      pp2: ['human', 'human', 'off', 'off'],
      pp4: ['human', 'human', 'human', 'human'],
      watch: ['bot', 'bot', 'bot', 'bot'],
    };
    const types = map[name];
    if (!types) return;
    types.forEach((t, k) => {
      const s = setupState.slots[k];
      s.type = t;
      if (t === 'human' && s.name === DEFAULT_SLOTS[k].name && k > 0) s.name = `Người ${k + 1}`;
      if (t === 'bot' && /^Người \d$/.test(s.name)) s.name = DEFAULT_SLOTS[k].name;
    });
    Sound.click();
    renderSlots();
  }

  function showSetup() {
    resetSession();
    clearTransientUI();
    loadSetupFromSettings();
    $('#opt-money').value = String(setupState.startMoney);
    $('#opt-rounds').value = String(setupState.maxRounds);
    $('#opt-speed').value = settings.speed;
    renderSlots();
    const saved = loadGame();
    const resume = $('#resume-box');
    if (saved && saved.status === 'playing') {
      resume.classList.remove('hidden');
      const cur = saved.players[saved.current];
      $('#resume-info').innerHTML = `Vòng ${saved.round} · ${saved.players.length} người chơi · tới lượt <b style="color:${cur.color}">${esc(cur.name)}</b>`;
    } else {
      resume.classList.add('hidden');
    }
    dom.setup.classList.remove('hidden');
    setTimeout(() => {
      const btn = $('#btn-start');
      if (btn) btn.focus({ preventScroll: true });
    }, 50);
  }

  function hideSetup() {
    dom.setup.classList.add('hidden');
  }

  function startFromSetup() {
    const active = setupState.slots.map((s, k) => ({ ...s, k })).filter((s) => s.type !== 'off');
    if (active.length < 2) {
      toast('⚠️ Cần ít nhất 2 người chơi để bắt đầu!', 'bad');
      Sound.bad();
      return;
    }
    setupState.startMoney = Number($('#opt-money').value) || 2000;
    setupState.maxRounds = Number($('#opt-rounds').value) || 0;
    settings.speed = SPEEDS[$('#opt-speed').value] ? $('#opt-speed').value : 'normal';
    settings.setup = {
      slots: setupState.slots.map((s) => ({ type: s.type, name: s.name, avatar: s.avatar })),
      startMoney: setupState.startMoney,
      maxRounds: setupState.maxRounds,
    };
    saveSettings();
    applySettings();
    Sound.unlock();
    const cfg = {
      startMoney: setupState.startMoney,
      maxRounds: setupState.maxRounds,
      players: active.map((s) => ({
        name: (s.name || '').trim().slice(0, 14) || (s.type === 'bot' ? `Máy ${s.k + 1}` : `Người ${s.k + 1}`),
        type: s.type,
        color: PLAYER_COLORS[s.k],
        avatar: s.avatar,
      })),
    };
    hideSetup();
    startNewGame(cfg);
  }

  function clearTransientUI() {
    if (dom.modalRoot) dom.modalRoot.innerHTML = '';
    if (dom.toasts) dom.toasts.innerHTML = '';
    selectHandler = null;
    clearSelection();
    clearActions();
    hideTooltip();
    $$('.turn-banner, .tile-fx').forEach((e) => e.remove());
    tileEls.forEach((e) => e.classList.remove('chosen', 'pulse'));
  }

  function mountGame() {
    buildCards();
    buildTokens();
    renderAll();
    renderLog();
    setDiceFaces(state.lastRoll || [5, 2], false);
    setStatus('');
    clearActions();
    updateLayout();
  }

  function startNewGame(cfg) {
    resetSession();
    clearTransientUI();
    state = createState(cfg);
    state.deck = shuffle(CHANCE_CARDS.map((c) => c.id));
    const humans = state.players.filter((p) => !isBot(p)).length;
    log(`🎲 Ván đấu bắt đầu với ${state.players.length} người chơi${humans >= 2 ? ' (Pass & Play)' : ''}. Chúc may mắn!`, 'good');
    mountGame();
    saveGame();
    runLoop();
  }

  function resumeFromSave() {
    const s = loadGame();
    if (!s) {
      showSetup();
      return;
    }
    resetSession();
    clearTransientUI();
    hideSetup();
    state = s;
    mountGame();
    Sound.unlock();
    if (state.status === 'playing') runLoop();
    else showGameOver(false);
  }

  function showWelcomeBack() {
    const cur = state.players[state.current];
    openModal({
      icon: '💾',
      title: 'Chào mừng trở lại!',
      html: `<p>Ván đấu của bạn đã được <b>tự động khôi phục</b> từ trình duyệt.</p><p>Đang ở <b>Vòng ${state.round}</b>, tới lượt ${pn(cur)}.</p>`,
      buttons: [
        { label: '🆕 Ván mới', value: 'new', style: 'ghost' },
        { label: '▶ Tiếp tục chơi', value: 'go', style: 'primary', hotkey: true },
      ],
    })
      .then((v) => {
        Sound.unlock();
        if (v === 'new') showSetup();
        else runLoop();
      })
      .catch(() => {});
  }

  function applySettings() {
    Sound.enabled = settings.sound;
    const sp = S();
    const root = document.documentElement.style;
    root.setProperty('--step-ms', `${sp.step}ms`);
    root.setProperty('--fly-ms', `${sp.fly}ms`);
    root.setProperty('--dice-ms', `${sp.dice}ms`);
    const sb = $('#tb-sound');
    if (sb) {
      sb.querySelector('.tb-ico').textContent = settings.sound ? '🔊' : '🔇';
      sb.setAttribute('aria-pressed', String(settings.sound));
    }
    const sp2 = $('#tb-speed .tb-label');
    if (sp2) sp2.textContent = sp.label;
  }

  function updateLayout() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const portrait = H > W * 1.05;
    const base = portrait ? Math.min(W - 16, H - 84) : Math.min(H - 20, W - 96);
    const compact = base < 640;
    document.body.classList.toggle('portrait', portrait);
    document.body.classList.toggle('landscape', !portrait);
    document.body.classList.toggle('compact', compact);
    placeCards();
    requestAnimationFrame(() => layoutTokens(true));
  }

  function bindUI() {
    $('#tb-sound').addEventListener('click', () => {
      settings.sound = !settings.sound;
      saveSettings();
      applySettings();
      if (settings.sound) {
        Sound.unlock();
        Sound.coin();
      }
    });
    $('#tb-speed').addEventListener('click', () => {
      const k = SPEED_ORDER.indexOf(settings.speed);
      settings.speed = SPEED_ORDER[(k + 1) % SPEED_ORDER.length];
      saveSettings();
      applySettings();
      Sound.click();
      toast(`⏩ Tốc độ: <b>${S().label}</b>`, 'info', 1400);
    });
    $('#tb-log').addEventListener('click', showLogModal);
    $('#tb-rules').addEventListener('click', showRules);
    $('#tb-menu').addEventListener('click', () => {
      Sound.click();
      showSetup();
    });
    $('#btn-start').addEventListener('click', startFromSetup);
    $('#btn-resume').addEventListener('click', resumeFromSave);
    $('#btn-setup-rules').addEventListener('click', showRules);
    $$('[data-preset]').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

    document.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') {
        const modals = $$('#modal-root .modal-backdrop:not(.closing):not(.passive)');
        if (!modals.length && !dom.setup.classList.contains('hidden')) return;
        let btn = null;
        if (modals.length) btn = modals[modals.length - 1].querySelector('[data-hotkey]');
        else btn = dom.actions.querySelector('[data-hotkey]');
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      } else if (e.key === 'Escape') {
        hideTooltip();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tile') && !e.target.closest('#tooltip')) hideTooltip();
    });
    document.addEventListener('pointerdown', () => Sound.unlock(), { passive: true });

    let raf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        hideTooltip();
        updateLayout();
      });
    });
  }

  function init() {
    cacheDom();
    buildBoard();
    buildDice();
    bindUI();
    applySettings();
    updateLayout();
    setDiceFaces([5, 2], false);
    renderTiles();
    const saved = loadGame();
    if (saved && saved.status === 'playing') {
      state = saved;
      mountGame();
      showWelcomeBack();
    } else if (saved && saved.status === 'gameover') {
      state = saved;
      mountGame();
      showGameOver(false);
    } else {
      showSetup();
    }
    // Điểm truy cập nhỏ để gỡ lỗi từ DevTools
    window.CoTyPhu = {
      get state() {
        return state;
      },
      settings,
      newGame: startNewGame,
      render() {
        renderAll();
        layoutTokens(true);
      },
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
