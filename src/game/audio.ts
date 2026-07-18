// Tiny procedural sound engine (WebAudio) — no assets needed.

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.05, slide = 0) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noise(dur: number, gain = 0.08, lowpass = 1200) {
  const c = ac();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export type SfxName =
  | 'buy' | 'deny' | 'melee' | 'shoot' | 'arrow' | 'boom' | 'die'
  | 'special' | 'evolve' | 'basehit' | 'win' | 'lose' | 'click' | 'turret';

export function playSfx(name: SfxName) {
  switch (name) {
    case 'buy': tone(660, 0.08, 'square', 0.045); tone(990, 0.1, 'square', 0.04); break;
    case 'deny': tone(180, 0.15, 'sawtooth', 0.05, -60); break;
    case 'click': tone(520, 0.05, 'square', 0.03); break;
    case 'melee': noise(0.08, 0.06, 900); tone(140, 0.07, 'triangle', 0.05, -40); break;
    case 'shoot': noise(0.06, 0.07, 2400); tone(320, 0.05, 'sawtooth', 0.03, -120); break;
    case 'arrow': tone(900, 0.09, 'sine', 0.03, -500); break;
    case 'boom': noise(0.35, 0.12, 500); tone(70, 0.3, 'sine', 0.09, -30); break;
    case 'die': tone(300, 0.18, 'sawtooth', 0.04, -180); break;
    case 'basehit': noise(0.2, 0.08, 600); tone(95, 0.18, 'triangle', 0.06, -35); break;
    case 'turret': tone(440, 0.07, 'square', 0.04); tone(560, 0.09, 'square', 0.035); break;
    case 'special':
      noise(0.6, 0.1, 700);
      tone(200, 0.5, 'sawtooth', 0.05, -120);
      tone(1200, 0.4, 'sine', 0.03, -800);
      break;
    case 'evolve':
      [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.05), i * 90));
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'square', 0.05), i * 130));
      break;
    case 'lose':
      [400, 340, 280, 200].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.05), i * 180));
      break;
  }
}
