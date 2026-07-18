import {
  AGES, FIELD_W, FIELD_H, GROUND_Y, PLAYER_BASE_X, ENEMY_BASE_X,
} from './data';
import { turretPos, unitHeight } from './engine';
import type { GameEngine } from './engine';
import type { Side, UnitEnt, Theme } from './types';

// ---------- color helpers ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

export function teamColors(side: Side) {
  return side === 'player'
    ? { main: '#2563eb', light: '#93c5fd', dark: '#1e3a8a', glow: '#38bdf8' }
    : { main: '#dc2626', light: '#fca5a5', dark: '#7f1d1d', glow: '#fb7185' };
}

// ---------- background ----------

function drawSkyHalf(ctx: CanvasRenderingContext2D, theme: Theme, x0: number, x1: number) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, theme.skyTop);
  g.addColorStop(0.55, theme.skyMid);
  g.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(x0, 0, x1 - x0, GROUND_Y);

  // hills with tight clip
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, x1 - x0, GROUND_Y);
  ctx.clip();
  ctx.fillStyle = theme.hillFar;
  ctx.globalAlpha = 0.75;
  drawHills(ctx, x0, x1, GROUND_Y - 130, 70, 3.1);
  ctx.fillStyle = theme.hill;
  ctx.globalAlpha = 0.9;
  drawHills(ctx, x0, x1, GROUND_Y - 60, 55, 5.7);
  ctx.globalAlpha = 1;
  ctx.restore();

}

function drawHills(ctx: CanvasRenderingContext2D, x0: number, x1: number, baseY: number, amp: number, seed: number) {
  ctx.beginPath();
  ctx.moveTo(x0, GROUND_Y);
  const w = x1 - x0;
  for (let i = 0; i <= 24; i++) {
    const x = x0 + (w * i) / 24;
    const y = baseY - Math.abs(Math.sin(i * 0.7 + seed) * amp + Math.sin(i * 1.7 + seed * 2) * amp * 0.4);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(x1, GROUND_Y);
  ctx.closePath();
  ctx.fill();
}

function drawSkyProps(ctx: CanvasRenderingContext2D, theme: Theme, x0: number, x1: number, t: number, isLeft: boolean) {
  const mid = (x0 + x1) / 2;
  const w = x1 - x0;
  if (theme.night) {
    // stars + moon
    ctx.fillStyle = '#e0e7ff';
    for (let i = 0; i < 40; i++) {
      const sx = x0 + ((i * 197.3) % w);
      const sy = ((i * 89.7) % (GROUND_Y - 220)) + 8;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.globalAlpha = 0.3 + tw * 0.6;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fef3c7';
    ctx.beginPath();
    ctx.arc(mid + w * 0.22, 70, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.skyTop;
    ctx.beginPath();
    ctx.arc(mid + w * 0.22 + 10, 64, 22, 0, Math.PI * 2);
    ctx.fill();
    // neon towers
    for (let i = 0; i < 5; i++) {
      const bx = x0 + w * (0.08 + i * 0.19);
      const bh = 90 + ((i * 53) % 80);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(bx, GROUND_Y - 135 - bh, 34, bh + 135);
      ctx.fillStyle = i % 2 ? '#22d3ee' : '#e879f9';
      for (let wy = 0; wy < 4; wy++) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * 3 + i + wy);
        ctx.fillRect(bx + 6, GROUND_Y - 120 - bh + wy * 26, 8, 10);
        ctx.fillRect(bx + 20, GROUND_Y - 120 - bh + wy * 26, 8, 10);
      }
      ctx.globalAlpha = 1;
    }
  } else if (isLeft) {
    // sun
    const sunX = mid - w * 0.25;
    const sunY = 66;
    const sg = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 60);
    sg.addColorStop(0, 'rgba(255,255,220,0.95)');
    sg.addColorStop(1, 'rgba(255,255,220,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 60, sunY - 60, 120, 120);
  }
  if (!theme.night) {
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) {
      const cx = x0 + ((i * 313 + t * 12) % (w + 160)) - 80;
      const cy = 40 + i * 34;
      cloud(ctx, cx, cy, 22 + i * 5);
    }
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.9, y + 4, r * 0.75, 0, Math.PI * 2);
  ctx.arc(x - r * 0.9, y + 5, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround(ctx: CanvasRenderingContext2D, pt: Theme, et: Theme) {
  const mid = FIELD_W / 2;
  // blend band
  const band = 160;
  const strips = 16;
  for (let i = 0; i < strips; i++) {
    const f0 = i / strips;
    const x = mid - band / 2 + (band * i) / strips;
    ctx.fillStyle = lerpColor(pt.ground, et.ground, f0);
    ctx.fillRect(x, GROUND_Y, band / strips + 1, FIELD_H - GROUND_Y);
  }
  ctx.fillStyle = pt.ground;
  ctx.fillRect(0, GROUND_Y, mid - band / 2, FIELD_H - GROUND_Y);
  ctx.fillStyle = et.ground;
  ctx.fillRect(mid + band / 2, GROUND_Y, FIELD_W - mid - band / 2, FIELD_H - GROUND_Y);
  // top edge line
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, GROUND_Y, FIELD_W, 3);
  // texture dashes
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 60; i++) {
    const x = (i * 173.7) % FIELD_W;
    const y = GROUND_Y + 12 + ((i * 37.3) % (FIELD_H - GROUND_Y - 16));
    ctx.fillRect(x, y, 14 + (i % 3) * 8, 3);
  }
}

// ---------- bases ----------

export function drawBase(
  ctx: CanvasRenderingContext2D,
  side: Side,
  ageIdx: number,
  flash: number,
  t: number,
) {
  const bx = side === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X;
  const dir = side === 'player' ? 1 : -1;
  const tc = teamColors(side);
  ctx.save();
  ctx.translate(bx, GROUND_Y);
  ctx.scale(dir, 1);

  switch (ageIdx) {
    case 0: baseCave(ctx, tc); break;
    case 1: baseCastle(ctx, tc, t); break;
    case 2: baseFort(ctx, tc, t); break;
    case 3: baseBunker(ctx, tc, t); break;
    default: baseFuture(ctx, tc, t); break;
  }

  if (flash > 0) {
    ctx.globalAlpha = Math.min(0.3, flash * 2.2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-70, -230, 140, 230);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function baseCave(ctx: CanvasRenderingContext2D, tc: ReturnType<typeof teamColors>) {
  // rock mound
  ctx.fillStyle = '#78716c';
  ctx.beginPath();
  ctx.moveTo(-62, 0);
  ctx.quadraticCurveTo(-66, -110, -10, -138);
  ctx.quadraticCurveTo(40, -160, 58, -80);
  ctx.quadraticCurveTo(66, -30, 62, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath();
  ctx.moveTo(-52, 0);
  ctx.quadraticCurveTo(-54, -90, -8, -118);
  ctx.quadraticCurveTo(20, -134, 40, -96);
  ctx.quadraticCurveTo(30, -110, 0, -96);
  ctx.quadraticCurveTo(-40, -78, -52, 0);
  ctx.fill();
  // entrance
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.ellipse(10, -34, 26, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  // bones
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-48, -8); ctx.lineTo(-30, -16);
  ctx.moveTo(-46, -18); ctx.lineTo(-32, -4);
  ctx.stroke();
  // skull on top
  ctx.fillStyle = '#e7e5e4';
  ctx.beginPath();
  ctx.arc(-6, -140, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1c1917';
  ctx.beginPath();
  ctx.arc(-9, -142, 2.4, 0, Math.PI * 2);
  ctx.arc(-3, -142, 2.4, 0, Math.PI * 2);
  ctx.fill();
  // flag
  ctx.fillStyle = tc.main;
  ctx.beginPath();
  ctx.moveTo(30, -128);
  ctx.lineTo(58, -120);
  ctx.lineTo(30, -110);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(30, -128); ctx.lineTo(30, -96); ctx.stroke();
}

function baseCastle(ctx: CanvasRenderingContext2D, tc: ReturnType<typeof teamColors>, t: number) {
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(-56, -150, 112, 150);
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(-56, -150, 112, 10);
  // battlements
  ctx.fillStyle = '#9ca3af';
  for (let i = 0; i < 5; i++) ctx.fillRect(-56 + i * 24, -166, 14, 18);
  // tower
  ctx.fillStyle = '#9ca3af';
  ctx.fillRect(18, -196, 44, 196);
  for (let i = 0; i < 3; i++) ctx.fillRect(18 + i * 16, -210, 10, 16);
  // gate
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-18, -52);
  ctx.quadraticCurveTo(0, -72, 18, -52);
  ctx.lineTo(18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(-14 + i * 9, -58 + Math.abs(i - 1.5) * 4); ctx.lineTo(-14 + i * 9, 0); ctx.stroke();
  }
  // windows
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-38, -120, 12, 20);
  ctx.fillRect(34, -160, 10, 18);
  // flag
  const wave = Math.sin(t * 4) * 4;
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(40, -210); ctx.lineTo(40, -244); ctx.stroke();
  ctx.fillStyle = tc.main;
  ctx.beginPath();
  ctx.moveTo(40, -244);
  ctx.quadraticCurveTo(58 + wave, -240, 70 + wave, -236);
  ctx.lineTo(40, -226);
  ctx.closePath();
  ctx.fill();
}

function baseFort(ctx: CanvasRenderingContext2D, tc: ReturnType<typeof teamColors>, t: number) {
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(-58, -140, 116, 140);
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(-58, -140, 116, 8);
  // columns
  ctx.fillStyle = '#e7e5e4';
  for (let i = 0; i < 4; i++) ctx.fillRect(-50 + i * 30, -128, 12, 128);
  // dome
  ctx.fillStyle = '#65a30d';
  ctx.beginPath();
  ctx.arc(0, -140, 34, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#4d7c0f';
  ctx.fillRect(-4, -186, 8, 14);
  // side tower with cannon
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(26, -176, 40, 60);
  ctx.fillStyle = '#44403c';
  ctx.fillRect(46, -168, 26, 10);
  // gate
  ctx.fillStyle = '#57534e';
  ctx.fillRect(-16, -44, 32, 44);
  // flag
  const wave = Math.sin(t * 4 + 1) * 3;
  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -186); ctx.lineTo(0, -216); ctx.stroke();
  ctx.fillStyle = tc.main;
  ctx.beginPath();
  ctx.moveTo(0, -216); ctx.lineTo(24 + wave, -210); ctx.lineTo(0, -202); ctx.closePath();
  ctx.fill();
}

function baseBunker(ctx: CanvasRenderingContext2D, tc: ReturnType<typeof teamColors>, t: number) {
  // sandbags
  ctx.fillStyle = '#a16207';
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 5 - r; i++) {
      ctx.beginPath();
      ctx.ellipse(-58 + i * 26 + r * 12, -8 - r * 12, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // concrete bunker
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(-50, -120, 104, 96);
  ctx.fillStyle = '#4b5563';
  ctx.beginPath();
  ctx.moveTo(-50, -120);
  ctx.lineTo(54, -120);
  ctx.lineTo(40, -150);
  ctx.lineTo(-36, -150);
  ctx.closePath();
  ctx.fill();
  // slit
  ctx.fillStyle = '#111827';
  ctx.fillRect(-36, -100, 70, 12);
  // mg barrel
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(30, -97, 34, 6);
  // antenna
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-20, -150); ctx.lineTo(-20, -196); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ef4444' : '#7f1d1d';
  ctx.beginPath(); ctx.arc(-20, -199, 4, 0, Math.PI * 2); ctx.fill();
  // flag patch
  ctx.fillStyle = tc.main;
  ctx.fillRect(-46, -140, 18, 12);
  // door
  ctx.fillStyle = '#374151';
  ctx.fillRect(-8, -46, 26, 46);
}

function baseFuture(ctx: CanvasRenderingContext2D, tc: ReturnType<typeof teamColors>, t: number) {
  // main tower
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-52, -180, 104, 180);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-34, -216, 68, 40);
  // glowing edges
  ctx.strokeStyle = tc.glow;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3);
  ctx.strokeRect(-52, -180, 104, 180);
  ctx.strokeRect(-34, -216, 68, 40);
  // window strips
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? '#22d3ee' : '#e879f9';
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 4 + i * 1.3);
    ctx.fillRect(-42, -164 + i * 30, 84, 8);
  }
  ctx.globalAlpha = 1;
  // core orb
  const orb = ctx.createRadialGradient(0, -196, 2, 0, -196, 22);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.4, tc.glow);
  orb.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = orb;
  ctx.beginPath(); ctx.arc(0, -196, 22, 0, Math.PI * 2); ctx.fill();
  // gate
  ctx.fillStyle = '#020617';
  ctx.fillRect(-18, -52, 36, 52);
  ctx.strokeStyle = tc.glow;
  ctx.globalAlpha = 0.8;
  ctx.strokeRect(-18, -52, 36, 52);
  ctx.globalAlpha = 1;
}

// ---------- turrets ----------

function drawTurret(ctx: CanvasRenderingContext2D, side: Side, slot: number, defId: string, aimT: number, t: number) {
  const pos = turretPos(side, slot);
  const dir = side === 'player' ? 1 : -1;
  const tc = teamColors(side);
  const recoil = aimT > 0 ? aimT * 30 : 0;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.scale(dir, 1);
  // platform
  ctx.fillStyle = '#44403c';
  ctx.fillRect(-14, 0, 28, 8);
  ctx.fillStyle = '#292524';
  ctx.fillRect(-10, -6, 20, 8);

  const kind = defId;
  if (kind === 'rocktower' || kind === 'arrowtower') {
    // wooden tower top
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-9, -22, 18, 16);
    ctx.fillStyle = tc.main;
    ctx.fillRect(-9, -22, 18, 4);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(14 - recoil, -26); ctx.stroke();
  } else if (kind === 'catapult' || kind === 'ballista') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-12, -14, 24, 10);
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(16 - recoil, -26); ctx.stroke();
    ctx.fillStyle = '#57534e';
    ctx.beginPath(); ctx.arc(16 - recoil, -26, 5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'guntower' || kind === 'mgtower') {
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-10, -18, 20, 14);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(6 - recoil, -15, 22, 5);
    ctx.fillStyle = tc.main;
    ctx.fillRect(-10, -18, 20, 3);
  } else if (kind === 'bombard' || kind === 'rockettower') {
    ctx.fillStyle = '#374151';
    ctx.fillRect(-12, -20, 22, 16);
    ctx.fillStyle = '#111827';
    ctx.save();
    ctx.translate(0, -14);
    ctx.rotate(-0.35);
    ctx.fillRect(0 - recoil, -4, 30, 8);
    ctx.restore();
    ctx.fillStyle = tc.main;
    ctx.fillRect(-12, -20, 22, 3);
  } else {
    // laser / plasma
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-10, -20, 20, 16);
    ctx.strokeStyle = tc.glow;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 5);
    ctx.strokeRect(-10, -20, 20, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = tc.glow;
    ctx.beginPath(); ctx.arc(8 - recoil, -12, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ---------- units ----------

function drawUnit(ctx: CanvasRenderingContext2D, u: UnitEnt, t: number) {
  const dir = u.side === 'player' ? 1 : -1;
  const tc = teamColors(u.side);
  const s = u.def.scale;
  const dying = u.dieT !== 0;
  ctx.save();
  ctx.translate(u.x, GROUND_Y + u.yOff);
  if (dying) {
    const f = Math.max(0, u.dieT / 0.45);
    ctx.globalAlpha = f;
    ctx.rotate((1 - f) * 1.4 * dir);
  }
  ctx.scale(dir * s, s);

  const m = u.def.mount;
  if (m === 'dino') drawDino(ctx, u, tc);
  else if (m === 'horse') drawHorse(ctx, u, tc);
  else if (m === 'cannon') drawCannonUnit(ctx, u, tc);
  else if (m === 'tank') drawTank(ctx, u, tc, t);
  else if (m === 'mech') drawMech(ctx, u, tc, t);
  else drawHumanoid(ctx, u, tc, t);

  ctx.restore();

  // flash overlay
  if (u.flash > 0 && !dying) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.7, u.flash * 6);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(u.x, GROUND_Y + u.yOff - unitHeight(u.def) * 0.5, unitHeight(u.def) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // health bar
  if (!dying && u.hp < u.maxHp) {
    const h = unitHeight(u.def);
    const w = 30;
    const frac = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(u.x - w / 2 - 1, GROUND_Y + u.yOff - h - 11, w + 2, 5.5);
    ctx.fillStyle = u.side === 'player' ? '#22c55e' : '#ef4444';
    ctx.fillRect(u.x - w / 2, GROUND_Y + u.yOff - h - 10, w * frac, 3.5);
  }
}

function skinFor(id: string): string {
  if (id === 'bladebot' || id === 'blaster') return '#94a3b8';
  return '#fcd7b0';
}

function drawHumanoid(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>, t: number) {
  const id = u.def.id;
  const walk = Math.sin(u.walkT * 9);
  const attacking = u.attackAnim > 0;
  const atkF = attacking ? 1 - u.attackAnim / 0.32 : 0; // 0→1 during swing
  const skin = skinFor(id);

  // legs
  ctx.strokeStyle = id === 'bladebot' || id === 'blaster' ? '#475569' : '#57534e';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(walk * 4.5, 0);
  ctx.moveTo(0, -13);
  ctx.lineTo(-walk * 4.5, 0);
  ctx.stroke();

  // torso
  ctx.fillStyle = tc.main;
  ctx.beginPath();
  ctx.roundRect(-4.5, -27, 9, 15, 3);
  ctx.fill();

  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1, -31.5, 5.4, 0, Math.PI * 2);
  ctx.fill();

  // headgear
  ctx.fillStyle = tc.dark;
  if (id === 'clubman' || id === 'slingshot') {
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.arc(1, -33.5, 5.2, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (id === 'swordsman') {
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(1, -32.5, 5.6, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-4.6, -33, 11.2, 2.4);
  } else if (id === 'archer') {
    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(1, -32.8, 5.8, Math.PI * 0.9, Math.PI * 2.05);
    ctx.fill();
  } else if (id === 'dueler' || id === 'musketeer') {
    ctx.fillStyle = '#44403c';
    ctx.fillRect(-6, -36.5, 14, 2.6);
    ctx.beginPath();
    ctx.arc(1, -36.5, 4.2, Math.PI, Math.PI * 2);
    ctx.fill();
    if (id === 'musketeer') {
      ctx.fillStyle = tc.light;
      ctx.fillRect(5, -42, 2, 6);
    }
  } else if (id === 'soldier' || id === 'bazooka') {
    ctx.fillStyle = '#3f6212';
    ctx.beginPath();
    ctx.arc(1, -32.8, 5.8, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-4.8, -33.4, 11.6, 1.8);
  } else {
    // robot visor
    ctx.fillStyle = tc.glow;
    ctx.fillRect(-2.5, -33.5, 8, 2.6);
  }

  // weapon arm
  const shoulder = { x: 2, y: -24 };
  let angle: number;
  if (u.def.ranged) {
    angle = attacking ? -0.06 + Math.sin(atkF * Math.PI) * -0.12 : 0.08;
  } else {
    angle = attacking ? -1.7 + atkF * 1.9 : 0.45 + walk * 0.12;
  }
  ctx.save();
  ctx.translate(shoulder.x, shoulder.y);
  ctx.rotate(angle);
  ctx.strokeStyle = skin;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, 0); ctx.stroke();
  drawWeapon(ctx, id, tc, t, attacking);
  ctx.restore();

  // shield for swordsman
  if (id === 'swordsman') {
    ctx.fillStyle = tc.dark;
    ctx.beginPath();
    ctx.roundRect(-8, -26, 5, 12, 2);
    ctx.fill();
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, id: string, tc: ReturnType<typeof teamColors>, t: number, attacking: boolean) {
  switch (id) {
    case 'clubman':
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(17, -2); ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.beginPath(); ctx.arc(18, -2, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'slingshot':
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(7, 0); ctx.lineTo(13, -1);
      ctx.moveTo(13, -1); ctx.lineTo(16, -6);
      ctx.moveTo(13, -1); ctx.lineTo(17, 3);
      ctx.stroke();
      break;
    case 'swordsman':
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, 0); ctx.stroke();
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(6, 3); ctx.stroke();
      break;
    case 'archer':
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(9, 0, 8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.strokeStyle = '#e7e5e4';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(9, -8); ctx.lineTo(attacking ? 4 : 9, 0); ctx.lineTo(9, 8); ctx.stroke();
      break;
    case 'dueler':
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(24, 0); ctx.stroke();
      ctx.fillStyle = '#b45309';
      ctx.beginPath(); ctx.arc(6, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'musketeer':
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(24, 0); ctx.stroke();
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.8;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(12, 1.5); ctx.stroke();
      break;
    case 'soldier':
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(4, -2.4, 20, 4.4);
      ctx.fillStyle = '#374151';
      ctx.fillRect(10, 2, 5, 5);
      break;
    case 'bazooka':
      ctx.fillStyle = '#374151';
      ctx.fillRect(-2, -4.5, 26, 8);
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(24, -0.5, 4.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bladebot': {
      const glow = ctx.createLinearGradient(6, 0, 26, 0);
      glow.addColorStop(0, '#e0f2fe');
      glow.addColorStop(1, tc.glow);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 12);
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(26, 0); ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'blaster':
      ctx.fillStyle = '#334155';
      ctx.fillRect(4, -3.4, 18, 6.4);
      ctx.fillStyle = tc.glow;
      ctx.fillRect(20, -2, 4, 4);
      break;
  }
}

function drawDino(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>) {
  const walk = Math.sin(u.walkT * 7);
  const atkF = u.attackAnim > 0 ? Math.sin((1 - u.attackAnim / 0.32) * Math.PI) : 0;
  // tail
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(-14, -22);
  ctx.quadraticCurveTo(-34, -20 + walk * 3, -40, -8);
  ctx.quadraticCurveTo(-28, -12, -14, -12);
  ctx.closePath();
  ctx.fill();
  // legs
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -14); ctx.lineTo(-6 + walk * 5, 0);
  ctx.moveTo(8, -14); ctx.lineTo(8 - walk * 5, 0);
  ctx.stroke();
  // body
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.ellipse(0, -22, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // belly
  ctx.fillStyle = '#86efac';
  ctx.beginPath();
  ctx.ellipse(2, -18, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // neck + head (lunges when attacking)
  ctx.save();
  ctx.translate(12, -28);
  ctx.rotate(-0.5 + atkF * 0.55);
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.ellipse(8, -6, 10, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(18, -10, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // eye + teeth
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(20, -12, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(20.8, -12, 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) ctx.fillRect(16 + i * 3, -6.5, 1.6, 2.6);
  ctx.restore();
  // saddle + rider
  ctx.fillStyle = tc.main;
  ctx.fillRect(-8, -34, 12, 5);
  ctx.strokeStyle = '#57534e';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-2, -33); ctx.lineTo(-2 + walk * 2, -26);
  ctx.stroke();
  ctx.fillStyle = tc.main;
  ctx.beginPath(); ctx.roundRect(-5.5, -45, 7, 12, 2.5); ctx.fill();
  ctx.fillStyle = '#fcd7b0';
  ctx.beginPath(); ctx.arc(-2, -48.5, 4.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#292524';
  ctx.beginPath(); ctx.arc(-2, -50.3, 4.2, Math.PI, Math.PI * 2); ctx.fill();
  // spear
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.4;
  const spearA = u.attackAnim > 0 ? -1.4 + (1 - u.attackAnim / 0.32) * 1.6 : 0.5;
  ctx.save();
  ctx.translate(-1, -42);
  ctx.rotate(spearA);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.stroke();
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath(); ctx.moveTo(20, -2.6); ctx.lineTo(25, 0); ctx.lineTo(20, 2.6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawHorse(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>) {
  const walk = Math.sin(u.walkT * 10);
  // legs
  ctx.strokeStyle = '#44403c';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, -16); ctx.lineTo(-12 + walk * 6, 0);
  ctx.moveTo(-4, -16); ctx.lineTo(-4 - walk * 6, 0);
  ctx.moveTo(8, -16); ctx.lineTo(8 - walk * 6, 0);
  ctx.moveTo(14, -16); ctx.lineTo(14 + walk * 6, 0);
  ctx.stroke();
  // body
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.ellipse(0, -24, 20, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // caparison (team cloth)
  ctx.fillStyle = tc.main;
  ctx.beginPath();
  ctx.ellipse(-2, -22, 15, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // neck + head
  ctx.save();
  ctx.translate(14, -30);
  ctx.rotate(-0.6 + (u.attackAnim > 0 ? 0.15 : 0));
  ctx.fillStyle = '#57534e';
  ctx.beginPath();
  ctx.ellipse(6, -6, 9, 5, -0.5, 0, Math.PI * 2);
  ctx.beginPath();
  ctx.ellipse(14, -11, 6, 4, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#292524';
  ctx.fillRect(4, -14, 3, 8); // mane
  ctx.restore();
  // tail
  ctx.strokeStyle = '#292524';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-19, -26);
  ctx.quadraticCurveTo(-26, -18 + walk * 3, -24, -8);
  ctx.stroke();
  // knight
  ctx.fillStyle = '#9ca3af';
  ctx.beginPath(); ctx.roundRect(-7, -48, 10, 16, 3); ctx.fill();
  ctx.fillStyle = '#d1d5db';
  ctx.beginPath(); ctx.arc(-2, -52.5, 5.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tc.main;
  ctx.fillRect(-2, -60, 2.4, 6); // plume
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, -54, 4.5, 1.8); // visor
  // lance
  const lanceA = u.attackAnim > 0 ? -0.9 + (1 - u.attackAnim / 0.32) * 0.75 : -0.12;
  ctx.save();
  ctx.translate(2, -44);
  ctx.rotate(lanceA);
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(30, 0); ctx.stroke();
  ctx.fillStyle = tc.light;
  ctx.beginPath(); ctx.moveTo(30, -3); ctx.lineTo(36, 0); ctx.lineTo(30, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCannonUnit(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>) {
  const recoil = u.attackAnim > 0 ? (u.attackAnim / 0.32) * 8 : 0;
  // wheels
  ctx.fillStyle = '#44403c';
  ctx.beginPath(); ctx.arc(-10, -8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -8, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a8a29e';
  ctx.beginPath(); ctx.arc(-10, -8, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -8, 3.4, 0, Math.PI * 2); ctx.fill();
  // carriage
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-16, -16, 32, 7);
  // barrel
  ctx.save();
  ctx.translate(-recoil, -20);
  ctx.rotate(-0.18);
  ctx.fillStyle = '#1c1917';
  ctx.fillRect(-14, -5, 36, 10);
  ctx.fillStyle = '#44403c';
  ctx.fillRect(16, -6, 7, 12);
  ctx.restore();
  // team band
  ctx.fillStyle = tc.main;
  ctx.fillRect(-16, -9.5, 32, 3);
  // fuse spark
  if (u.cooldown < 0.4) {
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(-14, -26, 2 + Math.random() * 1.6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawTank(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>, t: number) {
  const recoil = u.attackAnim > 0 ? (u.attackAnim / 0.32) * 10 : 0;
  // tracks
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.roundRect(-30, -14, 60, 14, 7);
  ctx.fill();
  ctx.fillStyle = '#4b5563';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.arc(-22 + i * 11, -7, 4, 0, Math.PI * 2); ctx.fill();
  }
  // hull
  ctx.fillStyle = '#4d7c0f';
  ctx.beginPath();
  ctx.roundRect(-26, -26, 52, 13, 3);
  ctx.fill();
  // turret
  ctx.fillStyle = '#3f6212';
  ctx.beginPath(); ctx.arc(2, -28, 11, Math.PI, 0); ctx.fill();
  ctx.fillRect(-9, -28, 22, 5);
  // barrel
  ctx.fillStyle = '#1a2e05';
  ctx.fillRect(8 - recoil, -30, 30, 5);
  // star
  ctx.fillStyle = tc.light;
  ctx.beginPath();
  ctx.arc(-14, -20, 3.4, 0, Math.PI * 2);
  ctx.fill();
  // antenna
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(-12, -44); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 6) > 0 ? tc.glow : tc.dark;
  ctx.beginPath(); ctx.arc(-12, -45, 1.8, 0, Math.PI * 2); ctx.fill();
}

function drawMech(ctx: CanvasRenderingContext2D, u: UnitEnt, tc: ReturnType<typeof teamColors>, t: number) {
  const walk = Math.sin(u.walkT * 6);
  // legs
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -34); ctx.lineTo(-10 + walk * 6, -14); ctx.lineTo(-8 + walk * 8, 0);
  ctx.moveTo(8, -34); ctx.lineTo(12 - walk * 6, -14); ctx.lineTo(10 - walk * 8, 0);
  ctx.stroke();
  // torso
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.roundRect(-14, -62, 28, 30, 5);
  ctx.fill();
  ctx.strokeStyle = tc.glow;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
  ctx.strokeRect(-14, -62, 28, 30);
  ctx.globalAlpha = 1;
  // core
  ctx.fillStyle = tc.glow;
  ctx.beginPath(); ctx.arc(0, -47, 5, 0, Math.PI * 2); ctx.fill();
  // head
  ctx.fillStyle = '#334155';
  ctx.beginPath(); ctx.roundRect(-7, -74, 14, 12, 3); ctx.fill();
  ctx.fillStyle = tc.glow;
  ctx.fillRect(-4, -70, 10, 3);
  // arm cannon
  const recoil = u.attackAnim > 0 ? (u.attackAnim / 0.32) * 9 : 0;
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.roundRect(10 - recoil, -56, 26, 10, 4);
  ctx.fill();
  ctx.fillStyle = tc.glow;
  ctx.beginPath(); ctx.arc(36 - recoil, -51, 4, 0, Math.PI * 2); ctx.fill();
  // shoulder pad
  ctx.fillStyle = '#64748b';
  ctx.beginPath(); ctx.arc(-10, -60, 7, 0, Math.PI * 2); ctx.fill();
}

// ---------- projectiles & fx ----------

function drawProjectile(ctx: CanvasRenderingContext2D, p: { x: number; y: number; vx: number; vy: number; kind: string; side: Side }) {
  const ang = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);
  const tc = teamColors(p.side);
  switch (p.kind) {
    case 'stone':
      ctx.fillStyle = '#78716c';
      ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'arrow':
      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.fillStyle = '#d6d3d1';
      ctx.beginPath(); ctx.moveTo(6, -2.4); ctx.lineTo(10, 0); ctx.lineTo(6, 2.4); ctx.closePath(); ctx.fill();
      break;
    case 'bolt':
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(7, 0); ctx.stroke();
      ctx.fillStyle = '#a8a29e';
      ctx.beginPath(); ctx.moveTo(7, -3); ctx.lineTo(12, 0); ctx.lineTo(7, 3); ctx.closePath(); ctx.fill();
      break;
    case 'bullet':
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(3, 0); ctx.stroke();
      break;
    case 'shell':
      ctx.fillStyle = '#1c1917';
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(-6, 0, 2.4 + Math.random(), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'rocket':
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(-6, -2.4, 10, 4.8);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.moveTo(4, -2.4); ctx.lineTo(9, 0); ctx.lineTo(4, 2.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fb923c';
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-11 - Math.random() * 4, 0); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
      break;
    case 'laser':
      ctx.strokeStyle = tc.glow;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(6, 0); ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    case 'plasma': {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, tc.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawStrike(ctx: CanvasRenderingContext2D, s: { x: number; y: number; t: number; kind: string }) {
  const impact = 0.32;
  if (s.t < impact) {
    const f = s.t / impact;
    if (s.kind === 'beam') {
      // charging glow at impact point
      ctx.fillStyle = 'rgba(167,139,250,0.5)';
      ctx.beginPath(); ctx.arc(s.x, s.y - 4, 8 + f * 18, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const startY = -40;
    const startX = s.kind === 'arrow' ? s.x - 60 : s.x - 90;
    const x = startX + (s.x - startX) * f;
    const y = startY + (s.y - 14 - startY) * f * f;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(y - startY, s.x - startX));
    if (s.kind === 'meteor') {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
      g.addColorStop(0, '#fef3c7');
      g.addColorStop(0.5, '#f97316');
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#78350f';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    } else if (s.kind === 'arrow') {
      ctx.strokeStyle = '#44403c';
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = '#d6d3d1';
      ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(13, 0); ctx.lineTo(8, 3); ctx.closePath(); ctx.fill();
    } else if (s.kind === 'bomb') {
      ctx.fillStyle = '#1f2937';
      ctx.beginPath(); ctx.ellipse(0, 0, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-2, -7, 4, 3);
    } else {
      ctx.fillStyle = '#1c1917';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else {
    const f = (s.t - impact) / (0.85 - impact);
    if (s.kind === 'beam') {
      const a = 1 - f;
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(s.x, 0, s.x, s.y);
      g.addColorStop(0, 'rgba(232,121,249,0.2)');
      g.addColorStop(1, '#e879f9');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - 12 - Math.sin(f * 40) * 2, 0, 24, s.y);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x - 3, 0, 6, s.y);
      ctx.beginPath(); ctx.arc(s.x, s.y - 4, 26 * (1 - f * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(216,180,254,0.7)';
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const r = 12 + f * 46;
      ctx.globalAlpha = Math.max(0, 1 - f);
      const g = ctx.createRadialGradient(s.x, s.y - 8, 2, s.x, s.y - 8, r);
      g.addColorStop(0, '#fef3c7');
      g.addColorStop(0.4, s.kind === 'arrow' ? '#a8a29e' : '#f97316');
      g.addColorStop(1, 'rgba(239,68,68,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y - 8, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- main render ----------

export interface View {
  camX: number;
  scale: number;
  offY: number;
  w: number;
  h: number;
}

export function render(ctx: CanvasRenderingContext2D, engine: GameEngine, view: View, t: number) {
  const { camX, scale, offY, w, h } = view;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0c0a09';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  const shakeAmp = engine.shake * 9;
  const sx = (Math.random() - 0.5) * shakeAmp;
  const sy = (Math.random() - 0.5) * shakeAmp;
  ctx.translate(sx - camX * scale, sy + offY);
  ctx.scale(scale, scale);

  const pTheme = AGES[engine.ageIdx.player].theme;
  const eTheme = AGES[engine.ageIdx.enemy].theme;
  const mid = FIELD_W / 2;

  // sky: two halves with blend strips
  drawSkyHalf(ctx, pTheme, -80, mid);
  drawSkyHalf(ctx, eTheme, mid, FIELD_W + 80);
  const band = 140;
  const strips = 14;
  for (let i = 0; i < strips; i++) {
    const f = (i + 1) / (strips + 1);
    const x = mid - band / 2 + (band * i) / strips;
    const blend: Theme = {
      skyTop: lerpColor(pTheme.skyTop, eTheme.skyTop, f),
      skyMid: lerpColor(pTheme.skyMid, eTheme.skyMid, f),
      skyBottom: lerpColor(pTheme.skyBottom, eTheme.skyBottom, f),
      ground: lerpColor(pTheme.ground, eTheme.ground, f),
      groundDark: lerpColor(pTheme.groundDark, eTheme.groundDark, f),
      hill: lerpColor(pTheme.hill, eTheme.hill, f),
      hillFar: lerpColor(pTheme.hillFar, eTheme.hillFar, f),
      accent: pTheme.accent,
    };
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, blend.skyTop);
    g.addColorStop(0.55, blend.skyMid);
    g.addColorStop(1, blend.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, band / strips + 1, GROUND_Y);
    ctx.fillStyle = blend.hill;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(x, GROUND_Y - 60 - Math.sin(i) * 20, band / strips + 1, 80);
    ctx.globalAlpha = 1;
  }

  // sky props above the seam blend so clouds drift naturally across it
  drawSkyProps(ctx, pTheme, -80, mid, t, true);
  drawSkyProps(ctx, eTheme, mid, FIELD_W + 80, t, false);

  drawGround(ctx, pTheme, eTheme);

  // bases
  drawBase(ctx, 'player', engine.ageIdx.player, engine.baseFlash.player, t);
  drawBase(ctx, 'enemy', engine.ageIdx.enemy, engine.baseFlash.enemy, t);

  // turrets
  for (const side of ['player', 'enemy'] as Side[]) {
    engine.turrets[side].forEach((tr, i) => {
      if (tr) drawTurret(ctx, side, i, tr.def.id, tr.aimT, t);
    });
  }

  // units sorted for slight depth
  const sorted = [...engine.units].sort((a, b) => a.yOff - b.yOff);
  for (const u of sorted) drawUnit(ctx, u, t);

  // projectiles
  for (const p of engine.projectiles) drawProjectile(ctx, p);

  // strikes
  for (const s of engine.strikes) drawStrike(ctx, s);

  // particles
  for (const p of engine.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // floating texts
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  for (const f of engine.floats) {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.fillStyle = f.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;

  // base HP bars
  drawBaseBar(ctx, PLAYER_BASE_X, engine.baseHp.player, engine.baseMax.player);
  drawBaseBar(ctx, ENEMY_BASE_X, engine.baseHp.enemy, engine.baseMax.enemy);

  ctx.restore();
}

function drawBaseBar(ctx: CanvasRenderingContext2D, x: number, hp: number, max: number) {
  const w = 110;
  const y = GROUND_Y - 262;
  const frac = Math.max(0, hp / max);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2 - 2, y - 2, w + 4, 11);
  ctx.fillStyle = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#eab308' : '#ef4444';
  ctx.fillRect(x - w / 2, y, w * frac, 7);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.ceil(hp)}`, x, y + 6.5);
}
