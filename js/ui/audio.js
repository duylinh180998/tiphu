/**
 * Âm thanh tổng hợp bằng Web Audio API — không cần tải file mp3.
 */
import { store, S } from '../core/store.js';

let ctx = null;
let master = null;
let noiseBuf = null;

function ac() {
  if (!store.settings.sound || S().fx === 0) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch (e) {
    return null;
  }
}

function tone(freq, at = 0, dur = 0.15, opt = {}) {
  const c = ac();
  if (!c) return;
  const { type = 'sine', vol = 0.2, attack = 0.006, slide = null } = opt;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(at = 0, dur = 0.1, opt = {}) {
  const c = ac();
  if (!c) return;
  const { vol = 0.2, freq = 1500, q = 1, type = 'bandpass', sweep = null } = opt;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.8, dur + 0.05);
}

const seq = (list, opt) => list.forEach(([f, at, dur]) => tone(f, at, dur, opt));

const SOUNDS = {
  click() {
    tone(1100, 0, 0.04, { type: 'square', vol: 0.035 });
  },
  turn() {
    tone(660, 0, 0.12, { type: 'triangle', vol: 0.12 });
    tone(990, 0.09, 0.18, { type: 'triangle', vol: 0.1 });
  },
  dice() {
    for (let i = 0; i < 11; i++) {
      const at = i * 0.05 + Math.random() * 0.02;
      noise(at, 0.035, { vol: 0.3, freq: 2200 + Math.random() * 1800, q: 3 });
      tone(240 + Math.random() * 300, at, 0.03, { type: 'square', vol: 0.03 });
    }
  },
  diceLand() {
    noise(0, 0.07, { vol: 0.35, freq: 1100, q: 1.2 });
    tone(150, 0, 0.12, { type: 'triangle', vol: 0.22 });
    noise(0.09, 0.05, { vol: 0.2, freq: 1600, q: 2 });
  },
  step() {
    tone(560 + Math.random() * 90, 0, 0.07, { type: 'triangle', vol: 0.12 });
    noise(0, 0.03, { vol: 0.05, freq: 3000, q: 2 });
  },
  coin() {
    tone(988, 0, 0.08, { type: 'square', vol: 0.06 });
    tone(1319, 0.075, 0.32, { type: 'square', vol: 0.06 });
  },
  cash() {
    [1568, 1976, 2349].forEach((f, k) => tone(f, k * 0.06, 0.16, { type: 'sine', vol: 0.12 }));
  },
  pay() {
    // Tiếng tiền xu rơi lách cách
    for (let k = 0; k < 5; k++) {
      const at = k * 0.055 + Math.random() * 0.02;
      tone(2400 - k * 260 + Math.random() * 120, at, 0.09, { type: 'sine', vol: 0.09 });
      noise(at, 0.03, { vol: 0.05, freq: 5000, q: 4 });
    }
    tone(330, 0, 0.18, { type: 'triangle', vol: 0.08, slide: 220 });
  },
  buy() {
    seq([[523, 0, 0.14], [659, 0.07, 0.14], [784, 0.14, 0.14], [1047, 0.21, 0.32]], { type: 'triangle', vol: 0.18 });
  },
  build() {
    noise(0, 0.05, { vol: 0.35, freq: 500, q: 1 });
    tone(196, 0, 0.09, { type: 'square', vol: 0.06 });
    noise(0.13, 0.05, { vol: 0.35, freq: 650, q: 1 });
    tone(262, 0.13, 0.09, { type: 'square', vol: 0.06 });
    tone(784, 0.26, 0.22, { type: 'triangle', vol: 0.16 });
  },
  landmark() {
    seq([[523, 0, 0.18], [659, 0, 0.18], [784, 0, 0.18], [1047, 0.2, 0.5], [1319, 0.2, 0.5], [1568, 0.2, 0.55]], { type: 'sawtooth', vol: 0.045 });
    tone(1047, 0.2, 0.6, { type: 'triangle', vol: 0.15 });
  },
  buyout() {
    tone(110, 0, 0.35, { type: 'sawtooth', vol: 0.12, slide: 220 });
    seq([[440, 0.3, 0.18], [554, 0.3, 0.18], [659, 0.3, 0.3], [880, 0.45, 0.35]], { type: 'square', vol: 0.05 });
    noise(0, 0.3, { vol: 0.1, freq: 400, sweep: 2500, q: 0.8 });
  },
  chance() {
    const s = [1047, 1175, 1319, 1568, 1760, 2093];
    for (let k = 0; k < 7; k++) tone(s[Math.floor(Math.random() * s.length)], k * 0.05, 0.14, { type: 'sine', vol: 0.09 });
  },
  island() {
    tone(392, 0, 0.5, { type: 'sine', vol: 0.2, slide: 98 });
    noise(0, 0.9, { vol: 0.12, freq: 600, sweep: 200, type: 'lowpass', q: 0.5 });
  },
  fly() {
    noise(0, 0.8, { vol: 0.18, freq: 300, sweep: 3200, q: 0.8 });
    tone(300, 0, 0.8, { type: 'sine', vol: 0.05, slide: 900 });
  },
  festival() {
    seq([[784, 0, 0.12], [988, 0.08, 0.12], [1175, 0.16, 0.12], [1568, 0.24, 0.4]], { type: 'triangle', vol: 0.15 });
    for (let k = 0; k < 6; k++) noise(0.3 + k * 0.06, 0.05, { vol: 0.12, freq: 3000 + Math.random() * 3000, q: 5 });
  },
  doubles() {
    tone(880, 0, 0.12, { type: 'triangle', vol: 0.14 });
    tone(1175, 0.1, 0.22, { type: 'triangle', vol: 0.14 });
  },
  bad() {
    tone(220, 0, 0.32, { type: 'sawtooth', vol: 0.06, slide: 150 });
  },
  bankrupt() {
    [392, 370, 349, 311].forEach((f, k) => tone(f, k * 0.32, k === 3 ? 0.9 : 0.3, { type: 'sawtooth', vol: 0.07, slide: k === 3 ? 200 : null }));
  },
  win() {
    seq([[523, 0, 0.16], [659, 0.15, 0.16], [784, 0.3, 0.16], [1047, 0.45, 0.3], [784, 0.75, 0.14], [1047, 0.9, 0.7]], { type: 'triangle', vol: 0.2 });
    seq([[262, 0.45, 0.8], [392, 0.45, 0.8]], { type: 'sine', vol: 0.1 });
  },
  emote() {
    tone(1320, 0, 0.08, { type: 'sine', vol: 0.1 });
    tone(1760, 0.07, 0.12, { type: 'sine', vol: 0.08 });
  },
  join() {
    seq([[660, 0, 0.1], [880, 0.08, 0.16]], { type: 'triangle', vol: 0.12 });
  },
};

export const Sound = {
  play(name) {
    const fn = SOUNDS[name];
    if (fn) fn();
  },
  unlock() {
    ac();
  },
  setEnabled(on) {
    if (!ctx) return;
    if (!on && ctx.state === 'running') ctx.suspend();
    if (on && ctx.state === 'suspended') ctx.resume();
  },
};
