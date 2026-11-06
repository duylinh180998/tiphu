/**
 * Bộ sinh số ngẫu nhiên có seed (mulberry32). Seed nằm trong trạng thái ván
 * nên tải lại trang giữa lượt vẫn cho cùng kết quả xúc xắc (không "lắc lại" được).
 */
import { store } from './store.js';

export function rand() {
  const st = store.state;
  const a = (st.seed = (st.seed + 0x6d2b79f5) | 0);
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
