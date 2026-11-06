/**
 * Mô hình 3D dựng bằng CSS (transform-style: preserve-3d).
 * Hệ trục cục bộ của mặt ô: x sang phải, y xuống dưới (trong mặt phẳng), z hướng lên.
 * Camera nhìn từ phía +y / -x nên chỉ cần dựng mặt trên, mặt nam (+y) và mặt tây (-x).
 */
import { shade } from '../core/util.js';

const WINDOWS =
  'background-image:repeating-linear-gradient(0deg,transparent 0 7px,rgba(255,255,255,.38) 7px 10px),' +
  'repeating-linear-gradient(90deg,transparent 0 6px,rgba(0,0,0,.2) 6px 8px)';

/** Khối hộp chữ nhật đặt tại (x, y) trên mặt ô, cao h, đáy nâng lên z */
export function box(x, y, w, d, h, color, { z = 0, pattern = '' } = {}) {
  const pat = pattern ? `;${pattern}` : '';
  return `<div class="m3" style="left:${x}px;top:${y}px;width:${w}px;height:${d}px;transform:translateZ(${z}px)">` +
    `<i style="width:${w}px;height:${d}px;transform:translateZ(${h}px);background:${shade(color, 1.18)}"></i>` +
    `<i style="width:${w}px;height:${h}px;top:${d - h}px;transform-origin:50% 100%;transform:rotateX(-90deg);background-color:${shade(color, 0.86)}${pat}"></i>` +
    `<i style="width:${h}px;height:${d}px;transform-origin:0 50%;transform:rotateY(-90deg);background-color:${shade(color, 0.62)}${pat}"></i>` +
    '</div>';
}

/** Ngôi nhà mái hai mái (nóc chạy theo trục x) */
export function house(x, y, w, d, h, r, wall, roof) {
  const L = Math.hypot(d / 2, r);
  const a = (Math.atan2(r, d / 2) * 180) / Math.PI;
  return `<div class="m3" style="left:${x}px;top:${y}px;width:${w}px;height:${d}px">` +
    `<i style="width:${w}px;height:${h}px;top:${d - h}px;transform-origin:50% 100%;transform:rotateX(-90deg);background:${shade(wall, 0.92)}"></i>` +
    `<i style="width:${h}px;height:${d}px;transform-origin:0 50%;transform:rotateY(-90deg);background:${shade(wall, 0.7)}"></i>` +
    `<i style="width:${r}px;height:${d}px;transform-origin:0 50%;transform:translateZ(${h}px) rotateY(-90deg);clip-path:polygon(0 0,100% 50%,0 100%);background:${shade(wall, 0.64)}"></i>` +
    `<i style="width:${w}px;height:${L}px;top:${d - L}px;transform-origin:50% 100%;transform:translateZ(${h}px) rotateX(${-a}deg);background:${shade(roof, 1.08)}"></i>` +
    `<i style="width:${w}px;height:${L}px;transform-origin:50% 0;transform:translateZ(${h}px) rotateX(${a}deg);background:${shade(roof, 0.8)}"></i>` +
    '</div>';
}

/** Bảng đứng luôn quay mặt về camera (dùng cho emoji trang trí) */
export function billboard(x, y, content, cls = '') {
  return `<div class="bb-anchor" style="left:${x}px;top:${y}px"><div class="bb"><div class="bb-in ${cls}">${content}</div></div></div>`;
}

const WALL = '#f8fafc';

/** Công trình theo cấp của thành phố, màu theo chủ sở hữu. Khu đất ~56 x 56 px. */
export function cityModel(level, color) {
  switch (level) {
    case 1:
      return house(14, 14, 28, 24, 18, 12, WALL, color);
    case 2:
      return house(2, 20, 24, 22, 16, 11, WALL, color) + house(30, 6, 26, 24, 20, 12, WALL, color);
    case 3:
      return box(14, 4, 36, 32, 62, color, { pattern: WINDOWS }) + house(0, 38, 22, 16, 13, 8, WALL, color);
    case 4:
      return (
        box(6, 4, 46, 42, 14, '#f59e0b') +
        box(13, 11, 32, 28, 72, color, { z: 14, pattern: WINDOWS }) +
        box(18, 16, 22, 18, 30, '#fde68a', { z: 86 }) +
        box(26, 22, 6, 6, 40, '#fbbf24', { z: 116 })
      );
    default:
      return '';
  }
}

/** Chòi nghỉ dưỡng + dù biển cho khu nghỉ dưỡng có chủ */
export function resortModel(color) {
  return house(4, 14, 30, 26, 14, 14, '#fde68a', color) + billboard(46, 40, '⛱️', 'bb-sm');
}
