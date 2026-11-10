/**
 * Nhân vật "tỷ phú du lịch" vẽ bằng SVG: mũ, kính râm, áo khoác màu người chơi, dây chuyền vàng,
 * quần kaki, giày thể thao, tay cầm xấp tiền. Mỗi avatar ứng với một kiểu (mũ, tóc, màu da, kính…)
 * nên các người chơi trông khác nhau; màu áo khoác luôn là màu của người chơi (--pc).
 */
import { AVATARS } from '../config.js';

const SKINS = ['#ffd9b3', '#f6c79b', '#e8ab7c', '#c98a5b', '#8d5a3b'];
const HAIRS = ['#5b3a1e', '#1f2937', '#d4a017', '#b45309', '#7c2d12', '#e5e7eb'];
const PANTS = ['#d9b98a', '#475569', '#1e3a8a', '#7c5c3b', '#f1f5f9'];
const HATS = ['fedora', 'cap', 'none', 'beanie', 'long', 'fedora', 'spiky', 'cap'];

/** Kiểu nhân vật theo avatar (hoặc theo số ghế nếu avatar không có trong danh sách, ví dụ máy 🤖) */
function presetOf(avatar, seed = 0) {
  let k = AVATARS.indexOf(avatar);
  if (k < 0) k = 5 + seed * 3;
  return {
    skin: SKINS[k % SKINS.length],
    hair: HAIRS[(k * 5 + 1) % HAIRS.length],
    pants: PANTS[(k * 3) % PANTS.length],
    hat: HATS[k % HATS.length],
    glasses: k % 3 !== 2,
    robot: avatar === '🤖',
  };
}

const O = 'stroke="#3b2a1a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';

function hatSVG(kind, hair) {
  switch (kind) {
    case 'fedora':
      return `<path d="M36 44 Q38 14 60 14 Q82 14 84 44 Z" fill="#1e3a8a" ${O}/><path d="M36 38 Q60 30 84 38 L84 45 Q60 37 36 45 Z" fill="#8b5e34" ${O}/><path d="M20 47 Q60 30 100 47 Q60 56 20 47 Z" fill="#274690" ${O}/>`;
    case 'cap':
      return `<path d="M35 46 Q35 18 60 18 Q85 18 85 46 Z" fill="#dc2626" ${O}/><path d="M35 46 Q60 38 85 46 L104 52 Q84 56 60 50 Z" fill="#b91c1c" ${O}/><circle cx="60" cy="19" r="3" fill="#fef2f2" ${O}/>`;
    case 'beanie':
      return `<path d="M35 48 Q33 16 60 16 Q87 16 85 48 Z" fill="#0d9488" ${O}/><rect x="33" y="42" width="54" height="9" rx="4.5" fill="#99f6e4" ${O}/><circle cx="60" cy="13" r="6" fill="#f0fdfa" ${O}/>`;
    case 'long':
      return `<path d="M32 60 Q26 20 60 18 Q94 20 88 60 L92 96 Q84 100 82 70 L82 48 Q60 34 38 48 L38 70 Q36 100 28 96 Z" fill="${hair}" ${O}/><path d="M70 22 l10 -8 l2 12 Z" fill="#f472b6" ${O}/>`;
    case 'spiky':
      return `<path d="M34 50 L30 30 L42 36 L44 18 L55 30 L62 12 L68 30 L80 20 L80 36 L92 32 L86 50 Q60 36 34 50 Z" fill="${hair}" ${O}/>`;
    default:
      return `<path d="M34 50 Q30 20 60 18 Q90 20 86 50 Q76 34 60 36 Q44 34 34 50 Z" fill="${hair}" ${O}/>`;
  }
}

/** SVG nhân vật đứng (viewBox 120 x 200). opts.cash: tay cầm xấp tiền; opts.seed: số ghế */
export function characterSVG(avatar, { cash = true, seed = 0 } = {}) {
  const p = presetOf(avatar, seed);
  const skin = p.robot ? '#cbd5e1' : p.skin;
  const jacket = 'var(--pc)';
  const jd = 'color-mix(in srgb, var(--pc) 68%, #000)';
  const jl = 'color-mix(in srgb, var(--pc) 70%, #fff)';
  const face = p.robot
    ? `<rect x="44" y="60" width="32" height="12" rx="6" fill="#0f172a" ${O}/><circle cx="52" cy="66" r="3.2" fill="#22d3ee"/><circle cx="68" cy="66" r="3.2" fill="#22d3ee"/><path d="M50 82 h20" stroke="#3b2a1a" stroke-width="2.4" stroke-linecap="round"/><path d="M60 22 v-9" stroke="#3b2a1a" stroke-width="2.4"/><circle cx="60" cy="11" r="4" fill="#f43f5e" ${O}/>`
    : (p.glasses
      ? `<path d="M41 61 h17 v7 q-8 6 -17 0 Z M62 61 h17 v7 q-9 6 -17 0 Z" fill="#111827" ${O}/><path d="M58 63 h4 M41 62 l-6 -2 M79 62 l6 -2" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/><path d="M45 63 l5 0" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`
      : `<ellipse cx="50" cy="65" rx="3.4" ry="4.2" fill="#3b2a1a"/><ellipse cx="70" cy="65" rx="3.4" ry="4.2" fill="#3b2a1a"/><circle cx="51.2" cy="63.6" r="1.2" fill="#fff"/><circle cx="71.2" cy="63.6" r="1.2" fill="#fff"/>`) +
      `<path d="M42 55 q8 -5 15 -1 M63 54 q7 -4 15 1" fill="none" stroke="${p.hair}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M48 78 Q60 90 72 78 Q60 82 48 78 Z" fill="#fff" ${O}/><path d="M58 70 q2 4 5 2" fill="none" stroke="#3b2a1a" stroke-width="1.8" stroke-linecap="round"/>`;
  const cashSVG = cash
    ? `<g transform="translate(88 126) rotate(-12)"><rect x="-4" y="-9" width="26" height="15" rx="2" fill="#86efac" ${O}/><rect x="-1" y="-6" width="26" height="15" rx="2" fill="#4ade80" ${O}/><circle cx="12" cy="1.5" r="4" fill="#fef9c3" stroke="#ca8a04" stroke-width="1.2"/></g>`
    : '';
  return `<svg class="char-svg" viewBox="0 0 120 200" aria-hidden="true">
    <ellipse cx="60" cy="191" rx="34" ry="6" fill="rgba(0,0,0,.18)"/>
    <path d="M46 132 L42 178 L55 178 L60 140 L65 178 L78 178 L74 132 Z" fill="${p.pants}" ${O}/>
    <path d="M40 174 h16 v6 h-16 Z M64 174 h16 v6 h-16 Z" fill="color-mix(in srgb, ${p.pants} 80%, #000)" ${O}/>
    <path d="M34 190 Q34 180 46 180 L56 180 Q58 190 56 192 L36 192 Z" fill="#fff" ${O}/><path d="M36 188 h20" stroke="${jacket}" stroke-width="3"/>
    <path d="M86 190 Q86 180 74 180 L64 180 Q62 190 64 192 L84 192 Z" fill="#fff" ${O}/><path d="M64 188 h20" stroke="${jacket}" stroke-width="3"/>
    <path d="M44 96 Q60 90 76 96 L78 136 L42 136 Z" fill="#fff" ${O}/>
    <path d="M30 102 Q28 126 36 138 L44 134 Q40 120 42 106 Z" fill="${jacket}" ${O}/><circle cx="40" cy="138" r="6" fill="${skin}" ${O}/>
    <path d="M90 102 Q96 118 92 130 L84 128 Q84 116 78 106 Z" fill="${jacket}" ${O}/><circle cx="89" cy="131" r="6" fill="${skin}" ${O}/>
    <path d="M44 94 L32 100 Q30 124 40 142 L50 142 L52 112 Z" fill="${jacket}" ${O}/><path d="M76 94 L88 100 Q90 124 80 142 L70 142 L68 112 Z" fill="${jacket}" ${O}/>
    <path d="M44 94 L52 112 L50 122 L42 104 Z" fill="${jd}" ${O}/><path d="M76 94 L68 112 L70 122 L78 104 Z" fill="${jd}" ${O}/>
    <path d="M72 124 h9 v4 h-9 Z" fill="${jl}"/>
    <path d="M50 96 Q60 120 70 96" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 4.2"/>
    <circle cx="60" cy="113" r="7.5" fill="#fbbf24" stroke="#b45309" stroke-width="2"/><path d="M57 113 h6 M60 110 v6" stroke="#b45309" stroke-width="1.8" stroke-linecap="round"/>
    <rect x="54" y="86" width="12" height="12" rx="4" fill="${skin}" ${O}/>
    <circle cx="33" cy="67" r="6" fill="${skin}" ${O}/><circle cx="87" cy="67" r="6" fill="${skin}" ${O}/>
    <path d="M34 60 Q34 34 60 34 Q86 34 86 60 Q86 92 60 92 Q34 92 34 60 Z" fill="${skin}" ${O}/>
    ${p.robot ? '' : hatSVG(p.hat, p.hair)}
    ${face}
    ${cashSVG}
  </svg>`;
}
