/**
 * Hai xúc xắc 3D nằm trên mặt bàn cờ. Mặt có giá trị luôn hướng lên (+z).
 */
import { S } from '../core/store.js';
import { dom, el } from './dom.js';
import { Sound } from './audio.js';

const PIP_LAYOUT = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const spin = [0, 0];
let cubes = [];

export function buildDice() {
  dom.diceTray.innerHTML = '';
  cubes = [0, 1].map((k) => {
    const die = el('div', `die die-${k}`);
    const cube = el('div', 'cube');
    for (let f = 1; f <= 6; f++) {
      const face = el('div', `face f${f}`);
      for (let c = 0; c < 9; c++) {
        const on = PIP_LAYOUT[f].includes(c);
        face.appendChild(el('span', on ? `pip${f === 1 || f === 4 ? ' red' : ''}` : 'nopip'));
      }
      cube.appendChild(face);
    }
    const toss = el('div', 'die-toss');
    toss.appendChild(cube);
    die.appendChild(toss);
    dom.diceTray.appendChild(die);
    return cube;
  });
}

export function setDiceFaces(vals, animate) {
  vals.forEach((v, k) => {
    const cube = cubes[k];
    if (!cube) return;
    if (animate) spin[k] += 2 + Math.floor(Math.random() * 2);
    const [rx, ry] = FACE_ROT[v] || FACE_ROT[1];
    if (!animate) cube.style.transition = 'none';
    cube.style.transform = `rotateX(${rx + 360 * spin[k]}deg) rotateY(${ry + 360 * (spin[k] + k)}deg)`;
    if (!animate) {
      void cube.offsetWidth;
      cube.style.transition = '';
    }
  });
}

/** Bắt đầu hoạt ảnh lắc; trả về thời lượng (ms) để bên gọi chờ */
export function startDiceRoll(d1, d2) {
  const ms = S().dice;
  dom.diceTray.classList.remove('double', 'rolling');
  if (ms > 0) {
    void dom.diceTray.offsetWidth;
    dom.diceTray.classList.add('rolling');
    Sound.play('dice');
  }
  setDiceFaces([d1, d2], ms > 0);
  return ms;
}

export function finishDiceRoll(d1, d2) {
  if (S().dice > 0) Sound.play('diceLand');
  dom.diceTray.classList.remove('rolling');
  dom.diceTray.classList.toggle('double', d1 === d2);
}
