/**
 * Mô hình trên bàn cờ 3D: công trình, bãi biển và các biển đứng trang trí.
 * Mọi mô hình là "biển đứng" (billboard) luôn quay mặt về camera nên dễ nhìn ở góc nghiêng.
 */
import { buildingSVG } from './buildings.js';

/** Bảng đứng luôn quay mặt về camera (dùng cho emoji trang trí) */
export function billboard(x, y, content, cls = '') {
  return `<div class="bb-anchor" style="left:${x}px;top:${y}px"><div class="bb"><div class="bb-in ${cls}">${content}</div></div></div>`;
}

/**
 * Công trình dạng "hình dán" bo tròn luôn quay mặt về camera: dễ nhìn ở mọi góc,
 * thân nhà tô màu của chủ sở hữu để nhận ra ngay nhà của ai.
 */
export function buildingSprite(level, color) {
  const c = `style="--hc:${color}"`;
  switch (level) {
    case 1:
      return `<div class="hs hs-flag" ${c}><div class="hs-mound"></div><div class="hs-pole"></div><div class="hs-cloth"></div></div>`;
    case 2:
    case 3:
    case 4:
    case 5:
      return `<div class="hs hs-bld lv${level}" ${c}>${buildingSVG(level)}</div>`;
    default:
      return '';
  }
}

/** Công trình theo cấp của thành phố, màu theo chủ sở hữu. Khu đất ~56 x 56 px. */
export function cityModel(level, color) {
  return level > 0 ? billboard(28, 42, buildingSprite(level, color), 'bb-house') : '';
}

/**
 * Cổng lễ hội: hai cột cờ, băng rôn cong in chữ và dây cờ đuôi nheo.
 * kind 'street' (Lễ Hội Đường Phố, cam) hoặc 'world' (Lễ Hội Thế Giới, hồng); text in trên băng rôn.
 */
export function festivalGate(kind, text) {
  const [a, b] = kind === 'world' ? ['#ec4899', '#be185d'] : ['#fb923c', '#ea580c'];
  const flags = ['#f43f5e', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4'];
  let bunting = '';
  for (let k = 0; k < 7; k++) {
    const x = 18 + k * 12;
    const y = 58 + Math.sin((k / 6) * Math.PI) * 7;
    bunting += `<polygon points="${x - 5},${y} ${x + 5},${y + 0.6} ${x},${y + 10}" fill="${flags[k]}"/>`;
  }
  const svg = `<svg class="gate-svg" width="120" height="104" viewBox="0 0 120 104" aria-hidden="true">
    <rect x="9" y="12" width="4" height="92" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width=".8"/>
    <rect x="107" y="12" width="4" height="92" rx="2" fill="#f8fafc" stroke="#94a3b8" stroke-width=".8"/>
    <circle cx="11" cy="11" r="3.5" fill="#facc15"/><circle cx="109" cy="11" r="3.5" fill="#facc15"/>
    <path d="M13 58 Q60 74 107 58" fill="none" stroke="#475569" stroke-width="1"/>${bunting}
    <path d="M13 18 Q60 6 107 18 L107 44 Q60 32 13 44 Z" fill="${a}" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M13 40 Q60 28 107 40 L107 44 Q60 32 13 44 Z" fill="${b}"/>
    <text x="60" y="34" text-anchor="middle" style="font:800 15px 'Baloo 2',sans-serif;fill:#fff;letter-spacing:.06em">${text}</text>
  </svg>`;
  return billboard(0, 0, svg, 'bb-gate');
}

/** Bãi biển: luôn có cây dừa và dù; có chủ thì thêm chòi nghỉ màu của chủ */
export function resortModel(color) {
  const beach = billboard(12, 20, '🌴', 'bb-palm') + billboard(46, 46, '⛱️', 'bb-sm');
  if (!color) return beach + billboard(40, 14, '🌴', 'bb-palm bb-palm-sm');
  return beach + billboard(36, 30, `<div class="hs hs-cabana" style="--hc:${color}"><div class="hs-roof"></div><div class="hs-wall"><i class="hs-door"></i></div></div>`, 'bb-house');
}
