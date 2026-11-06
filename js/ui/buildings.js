/**
 * Bộ tòa nhà vẽ bằng SVG theo góc nhìn nghiêng (isometric) khớp với bàn cờ 3D:
 * thấy mặt trái (tối), mặt phải (sáng) và mái. Màu lấy từ biến CSS của người sở hữu
 * (--hc: màu chính, --hcd: tối, --hcl: sáng) nên nhìn là biết nhà của ai.
 *
 * Quy ước tọa độ của một khối hộp: (cx, gy) là góc TRƯỚC-DƯỚI của nền nhà,
 * a = nửa bề ngang nền, b = nửa chiều sâu nền (đã nén theo góc nghiêng), h = chiều cao.
 */

const DEPTH = 0.55; // tỉ lệ b/a: nền hình thoi bị nén theo góc nghiêng camera

const fmt = (n) => Number(n.toFixed(1));
const pts = (list) => list.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(' ');
const poly = (list, fill, stroke = 'rgba(0,0,0,.22)') => `<polygon points="${pts(list)}" style="fill:${fill};stroke:${stroke};stroke-width:.7;stroke-linejoin:round"/>`;

/** Điểm trên mặt trái: u chạy từ góc trái (0) tới góc trước (1), v từ chân (0) tới đỉnh (1) */
const onLeft = (k, u, v) => [k.cx - k.a + u * k.a, k.gy - k.b + u * k.b - v * k.h];
/** Điểm trên mặt phải: u chạy từ góc trước (0) tới góc phải (1) */
const onRight = (k, u, v) => [k.cx + u * k.a, k.gy - u * k.b - v * k.h];

function quad(k, side, u0, u1, v0, v1, fill, stroke) {
  const at = side === 'left' ? onLeft : onRight;
  return poly([at(k, u0, v0), at(k, u1, v0), at(k, u1, v1), at(k, u0, v1)], fill, stroke);
}

/** Khối hộp: trả về SVG của mặt trái, mặt phải, mặt trên và thông số để vẽ chi tiết lên các mặt */
function box(cx, gy, a, h, { left, right, top }) {
  const b = a * DEPTH;
  const k = { cx, gy, a, b, h };
  const svg =
    poly([[cx - a, gy - b - h], [cx, gy - h], [cx, gy], [cx - a, gy - b]], left) +
    poly([[cx, gy - h], [cx + a, gy - b - h], [cx + a, gy - b], [cx, gy]], right) +
    poly([[cx, gy - 2 * b - h], [cx + a, gy - b - h], [cx, gy - h], [cx - a, gy - b - h]], top);
  return { k, svg };
}

/** Mái chóp 4 mặt (thấy 2 mặt) đặt trên khối k, nhô ra một chút ở mép */
function hipRoof(k, rise, { left, right }) {
  const o = 1.18;
  const cy = k.gy - k.b - k.h;
  const L = [k.cx - k.a * o, cy];
  const F = [k.cx, cy + k.b * o];
  const R = [k.cx + k.a * o, cy];
  const apex = [k.cx, cy - rise];
  return poly([L, F, apex], left) + poly([F, R, apex], right);
}

/** Lưới cửa sổ trên một mặt */
function windows(k, side, cols, rows, { u0 = 0.14, u1 = 0.86, v0 = 0.12, v1 = 0.88, fill = '#dbeafe' } = {}) {
  let out = '';
  const du = (u1 - u0) / cols;
  const dv = (v1 - v0) / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      out += quad(k, side, u0 + du * (c + 0.2), u0 + du * (c + 0.8), v0 + dv * (r + 0.22), v0 + dv * (r + 0.82), fill, 'rgba(15,23,42,.35)');
    }
  }
  return out;
}

const svgWrap = (w, h, body) => `<svg class="bld" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

const WALL = { left: '#e9dcc6', right: '#fffaf0', top: '#f5ead8' };
const OWNER = { left: 'var(--hcd)', right: 'var(--hc)', top: 'var(--hcl)' };
const ROOF = { left: 'var(--hcd)', right: 'var(--hc)' };
const GOLD = { left: '#d97706', right: '#fbbf24', top: '#fde68a' };

/** Nhà cấp 1: nhà nhỏ tường kem, mái chóp màu chủ, ống khói, cửa và cửa sổ */
function cottage() {
  const W = 50;
  const H = 54;
  const body = box(25, H - 2, 17, 16, WALL);
  const chimney = box(32, body.k.gy - body.k.b - body.k.h - 1, 3, 13, { left: '#9a3412', right: '#c2410c', top: '#fdba74' });
  return svgWrap(W, H,
    body.svg +
    quad(body.k, 'right', 0.3, 0.62, 0, 0.66, 'var(--hcd)') +
    quad(body.k, 'left', 0.3, 0.72, 0.34, 0.8, '#bae6fd', 'rgba(15,23,42,.35)') +
    chimney.svg +
    hipRoof(body.k, 15, ROOF));
}

/** Nhà cấp 2: nhà hai tầng, hai hàng cửa sổ, mái chóp màu chủ */
function townhouse() {
  const W = 52;
  const H = 72;
  const body = box(26, H - 2, 18, 30, WALL);
  return svgWrap(W, H,
    body.svg +
    windows(body.k, 'left', 2, 2, { v0: 0.08 }) +
    windows(body.k, 'right', 2, 1, { v0: 0.52, v1: 0.92 }) +
    quad(body.k, 'right', 0.36, 0.64, 0, 0.42, 'var(--hcd)') +
    hipRoof(body.k, 17, ROOF));
}

/** Khách sạn: tòa cao tầng màu chủ, lưới cửa sổ, mái bằng có biển chữ H, mái hiên ở cửa */
function hotel() {
  const W = 56;
  const H = 104;
  const body = box(28, H - 2, 19, 66, OWNER);
  const roofY = body.k.gy - body.k.b - body.k.h;
  const awning = poly([onRight(body.k, 0.18, 0.2), onRight(body.k, 0.82, 0.2), [body.k.cx + 0.82 * body.k.a + 3, body.k.gy - 0.82 * body.k.b - 0.2 * body.k.h + 6], [body.k.cx + 0.18 * body.k.a + 3, body.k.gy - 0.18 * body.k.b - 0.2 * body.k.h + 6]], '#fef3c7');
  return svgWrap(W, H,
    body.svg +
    windows(body.k, 'left', 2, 5, { v0: 0.22 }) +
    windows(body.k, 'right', 2, 5, { v0: 0.22 }) +
    quad(body.k, 'right', 0.34, 0.66, 0, 0.17, '#1e293b') +
    awning +
    `<circle cx="${fmt(body.k.cx)}" cy="${fmt(roofY - 9)}" r="8" style="fill:#fff;stroke:var(--hcd);stroke-width:2"/>` +
    `<text x="${fmt(body.k.cx)}" y="${fmt(roofY - 5)}" text-anchor="middle" style="font:900 11px 'Baloo 2',sans-serif;fill:var(--hcd)">H</text>`);
}

/** Khối hộp đặt chồng lên giữa mặt trên của khối dưới */
function stack(below, a, h, colors) {
  const topCenterY = below.k.gy - below.k.b - below.k.h;
  return box(below.k.cx, topCenterY + a * DEPTH, a, h, colors);
}

/** Biểu Tượng: bệ vàng, tháp hai tầng màu chủ, mái vòm vàng và ngôi sao trên đỉnh */
function landmark() {
  const W = 60;
  const H = 128;
  const base = box(30, H - 2, 22, 9, GOLD);
  const tower = stack(base, 14, 54, OWNER);
  const crown = stack(tower, 9.5, 16, { left: 'var(--hcd)', right: 'var(--hcl)', top: '#fff7ed' });
  const domeY = crown.k.gy - crown.k.b - crown.k.h;
  return svgWrap(W, H,
    base.svg +
    tower.svg +
    windows(tower.k, 'left', 2, 4, { v0: 0.15, fill: '#fef9c3' }) +
    windows(tower.k, 'right', 2, 4, { v0: 0.15, fill: '#fef9c3' }) +
    crown.svg +
    `<path d="M21 ${fmt(domeY)} A9 9 0 0 1 39 ${fmt(domeY)} Z" style="fill:#fbbf24;stroke:#b45309;stroke-width:.8"/>` +
    `<rect x="29.2" y="${fmt(domeY - 19)}" width="1.6" height="11" style="fill:#b45309"/>` +
    `<polygon points="${pts(star(30, domeY - 22, 6.5, 2.8))}" style="fill:#fde047;stroke:#b45309;stroke-width:.8;stroke-linejoin:round"/>`);
}

function star(cx, cy, R, r) {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    out.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
  }
  return out;
}

/** SVG của công trình cấp 2..5 (cấp 1 Đất nền là lá cờ, vẽ ở models.js) */
export function buildingSVG(level) {
  switch (level) {
    case 2:
      return cottage();
    case 3:
      return townhouse();
    case 4:
      return hotel();
    case 5:
      return landmark();
    default:
      return '';
  }
}
