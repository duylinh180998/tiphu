/**
 * Dữ liệu bàn cờ 32 ô, nhóm màu và bộ thẻ Cơ Hội.
 * Ô 0 ở góc dưới trái, đi theo chiều kim đồng hồ.
 */
import { COST_MULT, RENT_MULT } from '../config.js';
import { r5 } from '../core/util.js';

export const GROUPS = [
  { name: 'Di Sản Việt', color: '#b45309' },
  { name: 'Đô Thị Việt', color: '#0891b2' },
  { name: 'Đông Nam Á', color: '#db2777' },
  { name: 'Đông Á', color: '#ea580c' },
  { name: 'Trung Đông', color: '#7c3aed' },
  { name: 'Nam Âu', color: '#65a30d' },
  { name: 'Tây Âu', color: '#0d9488' },
  { name: 'Bắc Mỹ', color: '#1e40af' },
];

export const TILES = [
  { type: 'start', name: 'BẮT ĐẦU', label: 'BẮT ĐẦU', icon: '🏁', prop: '🏁', sub: 'Nhận $300K' },
  { type: 'city', name: 'Hội An', group: 0, price: 60 },
  { type: 'city', name: 'Huế', group: 0, price: 60 },
  { type: 'city', name: 'Đà Lạt', group: 0, price: 80 },
  { type: 'resort', name: 'Phú Quốc' },
  { type: 'city', name: 'Hà Nội', group: 1, price: 100 },
  { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
  { type: 'city', name: 'Sài Gòn', group: 1, price: 120 },
  { type: 'island', name: 'ĐẢO HOANG', label: 'ĐẢO HOANG', icon: '🏝️', prop: '🏝️', sub: 'Kẹt 3 lượt' },
  { type: 'city', name: 'Bangkok', group: 2, price: 140 },
  { type: 'city', name: 'Kuala Lumpur', group: 2, price: 140 },
  { type: 'city', name: 'Singapore', group: 2, price: 160 },
  { type: 'resort', name: 'Bali' },
  { type: 'city', name: 'Seoul', group: 3, price: 180 },
  { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
  { type: 'city', name: 'Tokyo', group: 3, price: 200 },
  { type: 'festival', name: 'LỄ HỘI THẾ GIỚI', label: 'LỄ HỘI<br>THẾ GIỚI', icon: '🎉', prop: '🎡', sub: 'Thuê x2 → x4' },
  { type: 'city', name: 'Cairo', group: 4, price: 220 },
  { type: 'city', name: 'Istanbul', group: 4, price: 220 },
  { type: 'city', name: 'Dubai', group: 4, price: 240 },
  { type: 'resort', name: 'Maldives' },
  { type: 'city', name: 'Rome', group: 5, price: 260 },
  { type: 'chance', name: 'CƠ HỘI', icon: '🎁' },
  { type: 'city', name: 'Barcelona', group: 5, price: 280 },
  { type: 'tour', name: 'CHUYẾN BAY THẾ GIỚI', label: 'CHUYẾN BAY<br>THẾ GIỚI', icon: '✈️', prop: '✈️', sub: 'Bay $50K' },
  { type: 'city', name: 'Amsterdam', group: 6, price: 300 },
  { type: 'city', name: 'Paris', group: 6, price: 300 },
  { type: 'city', name: 'London', group: 6, price: 320 },
  { type: 'resort', name: 'Hawaii' },
  { type: 'city', name: 'Los Angeles', group: 7, price: 350 },
  { type: 'tax', name: 'THUẾ', icon: '💸', sub: '10% tiền mặt' },
  { type: 'city', name: 'New York', group: 7, price: 400 },
];

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

export const PROP_TILES = TILES.filter((t) => t.type === 'city' || t.type === 'resort').map((t) => t.i);
export const CITY_TILES = TILES.filter((t) => t.type === 'city').map((t) => t.i);
export const RESORT_TILES = TILES.filter((t) => t.type === 'resort').map((t) => t.i);
export const GROUP_TILES = GROUPS.map((g, k) => CITY_TILES.filter((i) => TILES[i].group === k));
export const SIDE_TILES = [0, 1, 2, 3].map((s) => PROP_TILES.filter((i) => i > s * 8 && i < s * 8 + 8));
export const SIDE_NAMES = ['cạnh Việt Nam', 'cạnh Châu Á', 'cạnh Trung Đông & Nam Âu', 'cạnh Tây Âu & Bắc Mỹ'];

/** Cạnh của một ô (0..3). Ô góc thuộc cạnh bắt đầu tại nó. */
export const sideOf = (i) => Math.floor(i / 8);
export const isCorner = (i) => i % 8 === 0;

/** Vị trí ô trên lưới 9x9: ô 0 ở góc dưới trái, đi theo chiều kim đồng hồ */
export function gridPos(i) {
  if (i <= 8) return { row: 9 - i, col: 1 };
  if (i <= 16) return { row: 1, col: 1 + (i - 8) };
  if (i <= 24) return { row: 1 + (i - 16), col: 9 };
  return { row: 9, col: 9 - (i - 24) };
}

export const SPECIAL_DESC = {
  start: 'Đi qua nhận <b>$300K</b>. Dừng đúng ô này được chọn nâng cấp 1 thành phố đang sở hữu (tối đa Nhà cấp 3).',
  island: 'Dừng tại đây bị kẹt <b>3 lượt</b>. Thoát bằng cách đổ xúc xắc đôi, trả <b>$200K</b> hoặc dùng thẻ Thuyền Cứu Hộ.',
  festival: 'Chọn 1 thành phố của bạn tổ chức Lễ Hội: tiền thuê <b>x2</b>, các lần tổ chức sau tăng lên <b>x3, x4</b>. Mỗi lúc chỉ 1 thành phố tổ chức Lễ Hội.',
  tour: 'Lượt kế tiếp được trả <b>$50K</b> để bay tới bất kỳ ô nào trên bàn cờ (bay qua Bắt Đầu vẫn nhận lương).',
  chance: 'Rút 1 thẻ Cơ Hội ngẫu nhiên: nhận thưởng, nộp phạt, ép bán nhà, trôi dạt ra Đảo Hoang, miễn phí nâng cấp…',
  tax: 'Nộp <b>10%</b> số tiền mặt đang có cho ngân hàng.',
};

export const CHANCE_CARDS = [
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
export const CARD_BY_ID = Object.fromEntries(CHANCE_CARDS.map((c) => [c.id, c]));
