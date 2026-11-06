/**
 * Tiện ích dùng chung: định dạng tiền, escape/sanitize HTML, sinh mã ngẫu nhiên.
 */

export const r5 = (x) => Math.round(x / 5) * 5;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/** Định dạng gọn: $850K, $1.25M */
export function fmt(k) {
  const sign = k < 0 ? '-' : '';
  const v = Math.abs(Math.round(k));
  if (v >= 1000) return `${sign}$${String(Math.round((v / 1000) * 100) / 100)}M`;
  return `${sign}$${v}K`;
}

/** Định dạng đầy đủ: $1,250K */
export function fmtFull(k) {
  const sign = k < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(k)).toLocaleString('en-US')}K`;
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
  else for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}

export function randomCode(len, alphabet) {
  return Array.from(randomBytes(len), (b) => alphabet[b % alphabet.length]).join('');
}

export function randomToken() {
  return Array.from(randomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'SPAN', 'BR', 'SMALL']);
const SAFE_CLASS = /^[\w\s-]{0,80}$/;
const SAFE_STYLE = /^\s*color\s*:\s*(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))\s*;?\s*$/i;

/**
 * Lọc HTML nhận từ máy khác qua mạng: chỉ giữ thẻ định dạng chữ đơn giản,
 * thuộc tính class an toàn và style màu chữ. Mọi thứ khác bị chuyển thành chữ thường.
 */
export function sanitizeHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html == null ? '' : html);
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE || !ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent || ''));
        return;
      }
      Array.from(child.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name === 'class' && SAFE_CLASS.test(attr.value)) return;
        if (name === 'style' && SAFE_STYLE.test(attr.value)) return;
        child.removeAttribute(attr.name);
      });
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}
