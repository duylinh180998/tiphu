/**
 * Mô hình trên bàn cờ 3D: công trình, bãi biển và các biển đứng trang trí.
 * Mọi mô hình là "biển đứng" (billboard) luôn quay mặt về camera nên dễ nhìn ở góc nghiêng.
 */

/** Bảng đứng luôn quay mặt về camera (dùng cho emoji trang trí) */
export function billboard(x, y, content, cls = '') {
  return `<div class="bb-anchor" style="left:${x}px;top:${y}px"><div class="bb"><div class="bb-in ${cls}">${content}</div></div></div>`;
}

/**
 * Công trình dạng "hình dán" bo tròn luôn quay mặt về camera: dễ nhìn ở mọi góc,
 * thân nhà tô màu của chủ sở hữu để nhận ra ngay nhà của ai.
 */
function buildingSprite(level, color) {
  const c = `style="--hc:${color}"`;
  switch (level) {
    case 1:
      return `<div class="hs hs-flag" ${c}><div class="hs-mound"></div><div class="hs-pole"></div><div class="hs-cloth"></div></div>`;
    case 2:
      return `<div class="hs hs-1" ${c}><div class="hs-roof"></div><div class="hs-wall"><i class="hs-win"></i><i class="hs-door"></i></div></div>`;
    case 3:
      return `<div class="hs hs-2" ${c}><div class="hs-cap"></div><div class="hs-body"><i class="hs-grid"></i><i class="hs-door"></i></div></div>`;
    case 4:
      return `<div class="hs hs-3" ${c}><div class="hs-wing l"></div><div class="hs-wing r"></div><div class="hs-body"><i class="hs-grid"></i><i class="hs-door"></i></div><div class="hs-sign">H</div></div>`;
    case 5:
      return `<div class="hs hs-4" ${c}><div class="hs-star">★</div><div class="hs-dome"></div><div class="hs-body"><i class="hs-grid"></i></div><div class="hs-base"></div></div>`;
    default:
      return '';
  }
}

/** Công trình theo cấp của thành phố, màu theo chủ sở hữu. Khu đất ~56 x 56 px. */
export function cityModel(level, color) {
  return level > 0 ? billboard(28, 42, buildingSprite(level, color), 'bb-house') : '';
}

/** Bãi biển: luôn có cây dừa và dù; có chủ thì thêm chòi nghỉ màu của chủ */
export function resortModel(color) {
  const beach = billboard(12, 20, '🌴', 'bb-palm') + billboard(46, 46, '⛱️', 'bb-sm');
  if (!color) return beach + billboard(40, 14, '🌴', 'bb-palm bb-palm-sm');
  return beach + billboard(36, 30, `<div class="hs hs-cabana" style="--hc:${color}"><div class="hs-roof"></div><div class="hs-wall"><i class="hs-door"></i></div></div>`, 'bb-house');
}
