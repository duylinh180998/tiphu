/**
 * Bố cục màn hình & camera:
 *  - "wide": màn ngang rộng — thẻ người chơi ở 4 góc, bàn cờ chiếm giữa.
 *  - "dock": màn dọc/hẹp — bàn cờ ở trên, thẻ người chơi + nhật ký xếp bên dưới.
 *  - Góc nhìn 3D (isometric) hoặc 2D (phẳng); "auto" chọn 3D cho màn rộng, 2D cho màn hẹp.
 */
import { VIEW_TILT } from '../config.js';
import { store } from '../core/store.js';
import { BOARD_PX } from './board3d.js';
import { placePanels } from './hud.js';
import { layoutTokens } from './tokens.js';

const RAD = Math.PI / 180;
const TOP_EXTRA = 150; // chiều cao công trình cao nhất (px cục bộ)
const BOTTOM_EXTRA = 26; // độ dày bàn cờ
const PANEL_W = 264;

let current = { docked: null, mode: null };

export const currentMode = () => current.mode;

function resolveMode(docked) {
  const v = store.settings.view;
  if (v === '3d' || v === '2d') return v;
  return docked ? '2d' : '3d';
}

export function updateLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cos = Math.cos(VIEW_TILT * RAD);
  const sin = Math.sin(VIEW_TILT * RAD);
  const dw = BOARD_PX * Math.SQRT2;
  const dh = dw * cos + (TOP_EXTRA + BOTTOM_EXTRA) * sin;
  const shift3d = ((TOP_EXTRA - BOTTOM_EXTRA) * sin) / 2;

  let docked = !(W >= 900 && W / H >= 1.2);
  let mode = resolveMode(docked);
  let zoom = 1;
  let camY = 0;
  let sceneH = 0;
  let sceneW = 0;
  let side = false;
  let barBelow = false;

  if (!docked) {
    if (mode === '3d') {
      // chừa 2 bên ~75px cho thanh công cụ để không che 2 góc trái/phải của bàn cờ
      zoom = Math.min((W - 150) / dw, (H - 16) / dh);
      camY = shift3d * zoom;
    } else {
      const avail = Math.min(H - 24, W - 2 * PANEL_W);
      if (avail < 440) docked = true;
      else zoom = avail / BOARD_PX;
    }
  }
  if (docked) {
    mode = resolveMode(true);
    side = W > H * 1.15; // điện thoại xoay ngang: bàn cờ bên trái, thẻ người chơi bên phải
    if (side) {
      const maxW = Math.max(240, W - 380);
      if (mode === '3d') {
        zoom = Math.min((H - 12) / dh, maxW / dw);
        camY = shift3d * zoom;
        sceneW = Math.ceil(dw * zoom + 12);
      } else {
        zoom = Math.min(H - 12, maxW) / BOARD_PX;
        sceneW = Math.ceil(BOARD_PX * zoom + 12);
      }
      sceneH = H;
    } else if (mode === '3d') {
      // Bàn cờ 3D trên màn dọc rất thấp: đặt thanh hành động bên dưới bàn cờ
      zoom = (W - 12) / dw;
      barBelow = true;
      sceneH = Math.ceil(dh * zoom + 16 + 96);
      camY = shift3d * zoom - 48;
    } else {
      zoom = Math.min((W - 12) / BOARD_PX, Math.max(300, H - 280) / BOARD_PX);
      sceneH = Math.ceil(BOARD_PX * zoom + 12);
      camY = 0;
    }
  }

  const body = document.body;
  body.classList.toggle('docked', docked);
  body.classList.toggle('wide', !docked);
  body.classList.toggle('side', side);
  body.classList.toggle('bar-below', barBelow);
  body.classList.toggle('view-3d', mode === '3d');
  body.classList.toggle('view-2d', mode === '2d');
  const root = document.documentElement.style;
  root.setProperty('--zoom', zoom.toFixed(4));
  root.setProperty('--cam-y', `${camY.toFixed(1)}px`);
  root.setProperty('--scene-h', docked ? `${sceneH}px` : '100%');
  root.setProperty('--scene-w', side ? `${sceneW}px` : '100%');
  // Phóng chữ trên ô khi bàn cờ hiển thị nhỏ để chữ không dưới ~7px
  root.setProperty('--fz', Math.min(1.5, Math.max(1, 7 / (15 * zoom))).toFixed(3));
  root.setProperty('--ov-w', `${Math.round(Math.max(250, (mode === '3d' ? 640 : 660) * zoom))}px`);
  root.setProperty('--ov-up', `${Math.round((mode === '3d' ? 100 : 82) * zoom)}px`);
  root.setProperty('--ov-down', `${Math.round((mode === '3d' ? 64 : 70) * zoom)}px`);

  placePanels(docked);
  current = { docked, mode };
  requestAnimationFrame(() => layoutTokens(true));
}
