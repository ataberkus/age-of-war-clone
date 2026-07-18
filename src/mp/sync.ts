import { unitHeight } from '../game/engine';
import { ProductionGameEngine, type ProductionHudSnapshot } from '../game/production-engine';
import {
  AGES, FIELD_W, GROUND_Y, EVOLVE_COSTS, UNIT_QUEUE_CAP, unitTrainingTime,
} from '../game/data';
import type {
  Side, UnitEnt, ProjectileEnt, TurretEnt, ParticleEnt, FloatText, StrikeFx, ProjectileKind,
  ProductionQueueViewEntry, UnitDef,
} from '../game/types';
import type { SfxName } from '../game/audio';
import type { Session, MpAction } from './session';

// ---------------- compact wire protocol ----------------
// Realtime broadcast payloads must stay small (~<2KB), so snapshots are
// packed as flat JSON arrays instead of named objects.

const PROJ_KINDS: ProjectileKind[] = ['stone', 'arrow', 'bolt', 'bullet', 'shell', 'rocket', 'laser', 'plasma'];
const STRIKE_KINDS: StrikeFx['kind'][] = ['meteor', 'arrow', 'shell', 'bomb', 'beam'];
const MAX_PROJS_SENT = 22;

function unitDefCode(def: UnitDef): number {
  for (let ageIdx = 0; ageIdx < AGES.length; ageIdx++) {
    const unitIdx = AGES[ageIdx].units.indexOf(def);
    if (unitIdx >= 0) return ageIdx * 10 + unitIdx;
  }
  throw new Error(`Unknown unit definition: ${def.id}`);
}

// unit code: age*10 + slot; turret code: 100 + age*10 + slot
export type PackedSnap = [
  number, // 0 t
  [number, number], // 1 gold
  [number, number], // 2 xp
  [number, number], // 3 ageIdx
  [number, number], // 4 baseHp
  [number, number], // 5 baseMax
  [number, number], // 6 specialCd
  number[][], // 7 units [uid, side, defCode, x, hp, dieT*10, atk*100]
  number[][], // 8 projs [x, y, vx, vy, kind, side]
  (number | null)[][], // 9 turrets [side][slot] -> code|null
  number[][], // 10 strikes [x, kind]
  [number, number], // 11 kills
  number, // 12 over 0/1
  number, // 13 winner -1 | 0 | 1
  [number[][], number[][]], // 14 queues [defCode, remainingTenths]
];

export function buildSnapshot(e: ProductionGameEngine): PackedSnap {
  const units: number[][] = e.units.map((u) => [
    u.uid,
    u.side === 'player' ? 0 : 1,
    unitDefCode(u.def),
    Math.round(u.x),
    Math.round(u.hp),
    Math.round(u.dieT * 10),
    Math.round(u.attackAnim * 100),
  ]);
  const projs: number[][] = e.projectiles.slice(-MAX_PROJS_SENT).map((p) => [
    Math.round(p.x),
    Math.round(p.y),
    Math.round(p.vx),
    Math.round(p.vy),
    PROJ_KINDS.indexOf(p.kind),
    p.side === 'player' ? 0 : 1,
  ]);
  const turrets: (number | null)[][] = (['player', 'enemy'] as Side[]).map((sd) =>
    e.turrets[sd].map((t) => (t ? 100 + e.ageIdx[sd] * 10 + e.age(sd).turrets.indexOf(t.def) : null)),
  );
  const strikes: number[][] = e.strikes.map((s) => [Math.round(s.x), STRIKE_KINDS.indexOf(s.kind)]);
  const queues = (['player', 'enemy'] as Side[]).map((side) =>
    e.productionQueues[side].map((entry) => [
      entry.ageIdx * 10 + entry.unitIdx,
      Math.round(Math.max(0, entry.remaining) * 10),
    ]),
  ) as [number[][], number[][]];
  return [
    Math.round(e.time * 10) / 10,
    [Math.floor(e.gold.player), Math.floor(e.gold.enemy)],
    [Math.floor(e.xp.player), Math.floor(e.xp.enemy)],
    [e.ageIdx.player, e.ageIdx.enemy],
    [Math.ceil(e.baseHp.player), Math.ceil(e.baseHp.enemy)],
    [e.baseMax.player, e.baseMax.enemy],
    [Math.round(e.specialCd.player * 10) / 10, Math.round(e.specialCd.enemy * 10) / 10],
    units,
    projs,
    turrets,
    strikes,
    [e.kills.player, e.kills.enemy],
    e.over ? 1 : 0,
    e.winner === null ? -1 : e.winner === 'player' ? 0 : 1,
    queues,
  ];
}

// ---------------- host side ----------------

export class HostSync {
  private sendT = 0;
  private engine: ProductionGameEngine;
  private session: Session;

  constructor(engine: ProductionGameEngine, session: Session) {
    this.engine = engine;
    this.session = session;
    engine.aiEnabled = false;
    session.onMessage = (event, payload) => {
      if (event === 'action') this.applyAction(payload as MpAction);
      else if (event === 'join') session.send('start', {}); // re-answer lost handshakes
    };
  }

  private applyAction(a: MpAction) {
    const e = this.engine;
    switch (a.type) {
      case 'buyUnit': e.buyUnit('enemy', a.idx ?? 0); break;
      case 'buyTurret': e.buyTurret('enemy', a.idx ?? 0); break;
      case 'evolve': e.evolve('enemy'); break;
      case 'special': e.useSpecial('enemy'); break;
      case 'cancelUnit': e.cancelQueuedUnit('enemy', a.idx ?? -1); break;
    }
  }

  update(dt: number) {
    this.sendT += dt;
    if (this.sendT >= 0.125) {
      this.sendT = 0;
      this.session.send('state', buildSnapshot(this.engine));
    }
  }
}

// ---------------- guest side ----------------

type LocalProj = ProjectileEnt & { localAge: number };

const mirrorSide = (s: Side): Side => (s === 'enemy' ? 'player' : 'enemy');
const sideFromBit = (b: number): Side => (b === 0 ? 'player' : 'enemy');
const mx = (x: number) => FIELD_W - x;

function unpackQueue(rows: number[][]): ProductionQueueViewEntry[] {
  return rows.flatMap(([defCode, remainingTenths]) => {
    const ageIdx = Math.floor(defCode / 10);
    const unitIdx = defCode % 10;
    const def = AGES[ageIdx]?.units[unitIdx];
    if (!def) return [];

    const remaining = Math.max(0, remainingTenths / 10);
    return [{
      ageIdx,
      unitIdx,
      duration: unitTrainingTime(unitIdx),
      remaining,
      ready: remaining <= 0,
    }];
  });
}

/**
 * The guest renders a mirrored "shadow" of the host's authoritative state.
 * It exposes the same public fields as GameEngine so the renderer works unchanged.
 */
export class GuestSync {
  // GameEngine-shaped public surface (from the guest's own perspective)
  ageIdx: Record<Side, number> = { player: 0, enemy: 0 };
  baseHp: Record<Side, number> = { player: 0, enemy: 0 };
  baseMax: Record<Side, number> = { player: 1, enemy: 1 };
  baseFlash: Record<Side, number> = { player: 0, enemy: 0 };
  turrets: Record<Side, (TurretEnt | null)[]> = { player: [null, null, null], enemy: [null, null, null] };
  units: (UnitEnt & { tx: number })[] = [];
  projectiles: LocalProj[] = [];
  particles: ParticleEnt[] = [];
  floats: FloatText[] = [];
  strikes: StrikeFx[] = [];
  shake = 0;
  over = false;
  winner: Side | null = null;
  events: SfxName[] = [];
  productionQueues: Record<Side, ProductionQueueViewEntry[]> = {
    player: [],
    enemy: [],
  };

  gold = 0;
  xp = 0;
  specialCd = 0;
  kills = 0;
  time = 0;

  private prevBaseHp: Record<Side, number> = { player: -1, enemy: -1 };
  private prevSpecialCd: Record<Side, number> = { player: -1, enemy: -1 };
  private session: Session;

  constructor(session: Session) {
    this.session = session;
    session.onMessage = (event, payload) => {
      if (event === 'state') this.applySnapshot(payload as PackedSnap);
    };
  }

  sendAction(a: MpAction) {
    this.session.send('action', a);
  }

  private applySnapshot(s: PackedSnap) {
    this.time = s[0];
    this.gold = s[1][1];
    this.xp = s[2][1];
    this.kills = s[11][1];
    this.ageIdx = { player: s[3][1], enemy: s[3][0] };

    // special-attack sound when either side triggers one
    const cds: Record<Side, number> = { player: s[6][0], enemy: s[6][1] };
    for (const sd of ['player', 'enemy'] as Side[]) {
      const cd = cds[sd];
      if (this.prevSpecialCd[sd] >= 0 && this.prevSpecialCd[sd] < 0.05 && cd > 1) {
        this.events.push('special');
      }
      this.prevSpecialCd[sd] = cd;
    }
    this.specialCd = cds.enemy;

    // base damage flashes + sfx (compare in host space, store in local space)
    const hps: Record<Side, number> = { player: s[4][0], enemy: s[4][1] };
    for (const sd of ['player', 'enemy'] as Side[]) {
      const hp = hps[sd];
      const prev = this.prevBaseHp[sd];
      if (prev >= 0 && hp < prev) {
        const local = mirrorSide(sd);
        this.baseFlash[local] = 0.15;
        this.shake = Math.min(0.5, this.shake + 0.1);
        this.events.push('basehit');
        const bx = local === 'player' ? 96 : FIELD_W - 96;
        for (let i = 0; i < 4; i++) {
          this.spawnParticle(bx + (Math.random() - 0.5) * 60, GROUND_Y - 40 - Math.random() * 100,
            (Math.random() - 0.5) * 100, -Math.random() * 90, 0.4, 3, '#d6d3d1', 300);
        }
      }
      this.prevBaseHp[sd] = hp;
    }
    this.baseHp = { player: hps.enemy, enemy: hps.player };
    this.baseMax = { player: s[5][1], enemy: s[5][0] };

    // units
    const seen = new Set<number>();
    for (const us of s[7]) {
      const [uid, sideBit, defCode, sx, hp, dieT10, atk100] = us;
      seen.add(uid);
      const side = mirrorSide(sideFromBit(sideBit));
      const x = mx(sx);
      const age = Math.floor(defCode / 10);
      const slot = defCode % 10;
      const def = AGES[age]?.units[slot];
      if (!def) continue;
      const dieT = dieT10 / 10;
      const atk = atk100 / 100;
      let u = this.units.find((v) => v.uid === uid);
      if (!u) {
        u = {
          uid, side, def, x, tx: x,
          yOff: ((uid * 37) % 11) - 5,
          hp, maxHp: def.hp, cooldown: 0.3,
          attackAnim: atk, walkT: Math.random() * 2, flash: 0,
          dieT: 0, speedJit: 1,
        };
        this.units.push(u);
      } else {
        u.tx = x;
        if (hp < u.hp) u.flash = 0.12;
        u.hp = hp;
        if (atk > u.attackAnim) u.attackAnim = atk;
      }
      if (dieT > 0 && u.dieT === 0) {
        u.dieT = 0.45;
        this.events.push('die');
        const h = unitHeight(u.def);
        const col = u.side === 'player' ? '#60a5fa' : '#f87171';
        for (let i = 0; i < 8; i++) {
          this.spawnParticle(u.x, GROUND_Y + u.yOff - h * 0.4,
            (Math.random() - 0.5) * 160, -Math.random() * 130, 0.55, 3, col, 340);
        }
        if (u.side === 'enemy') {
          this.floats.push({
            x: u.x, y: GROUND_Y + u.yOff - h - 12,
            text: `+${u.def.rewardGold}`, color: '#fbbf24', life: 0.9, maxLife: 0.9,
          });
        }
      }
    }
    this.units = this.units.filter((u) => seen.has(u.uid) || u.dieT > 0);

    // projectiles: match by kind+side+proximity, integrate locally between snapshots
    const matched = new Set<number>();
    for (const ps of s[8]) {
      const [sx, sy, svx, svy, kindCode, sideBit] = ps;
      const kind = PROJ_KINDS[kindCode];
      const side = mirrorSide(sideFromBit(sideBit));
      const x = mx(sx);
      const vx = -svx;
      let best: LocalProj | null = null;
      let bestD = 130;
      for (let i = 0; i < this.projectiles.length; i++) {
        if (matched.has(i)) continue;
        const lp = this.projectiles[i];
        if (lp.kind !== kind || lp.side !== side) continue;
        const d = Math.abs(lp.x - x) + Math.abs(lp.y - sy);
        if (d < bestD) { bestD = d; best = lp; matched.add(i); }
      }
      if (best) {
        best.x = x; best.y = sy; best.vx = vx; best.vy = svy; best.localAge = 0;
      } else {
        this.projectiles.push({
          x, y: sy, vx, vy: svy, side, damage: 0, kind,
          splash: 0, traveled: 0, maxTravel: 9999, targetBase: false, localAge: 0,
        });
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.localAge < 0.35);

    // turrets
    for (const sd of ['player', 'enemy'] as Side[]) {
      const local = mirrorSide(sd);
      const list = sd === 'player' ? s[9][0] : s[9][1];
      list.forEach((code, i) => {
        if (code === null || code === undefined) {
          this.turrets[local][i] = null;
        } else {
          const c = code - 100;
          const def = AGES[Math.floor(c / 10)]?.turrets[c % 10];
          this.turrets[local][i] = def ? { def, cooldown: 0, aimT: 0 } : null;
        }
      });
    }

    // strikes
    for (const ss of s[10]) {
      const x = mx(ss[0]);
      const kind = STRIKE_KINDS[ss[1]];
      const exists = this.strikes.some((k) => k.kind === kind && Math.abs(k.x - x) < 60);
      if (exists) continue;
      this.strikes.push({ x, y: GROUND_Y, t: 0, kind, delay: 0, exploded: false });
    }

    this.productionQueues = {
      player: unpackQueue(s[14][1]),
      enemy: unpackQueue(s[14][0]),
    };

    // game over
    if (s[12] === 1) {
      if (!this.over) {
        this.events.push((s[13] === 1 ? 'player' : s[13] === 0 ? 'enemy' : null) === 'player' ? 'win' : 'lose');
        this.shake = 1;
      }
      this.over = true;
      this.winner = s[13] === -1 ? null : mirrorSide(sideFromBit(s[13]));
    }
  }

  update(dt: number) {
    const activeQueueEntry = this.productionQueues.player[0];
    if (activeQueueEntry && activeQueueEntry.remaining > 0) {
      activeQueueEntry.remaining = Math.max(0, activeQueueEntry.remaining - dt);
      activeQueueEntry.ready = activeQueueEntry.remaining <= 0;
    }

    this.specialCd = Math.max(0, this.specialCd - dt);
    this.shake = Math.max(0, this.shake - dt * 1.4);
    this.baseFlash.player = Math.max(0, this.baseFlash.player - dt);
    this.baseFlash.enemy = Math.max(0, this.baseFlash.enemy - dt);

    for (const u of this.units) {
      u.flash = Math.max(0, u.flash - dt);
      u.attackAnim = Math.max(0, u.attackAnim - dt);
      if (u.dieT > 0) {
        u.dieT -= dt;
        continue;
      }
      const before = u.x;
      u.x += (u.tx - u.x) * Math.min(1, dt * 12);
      if (Math.abs(u.tx - before) > 0.5) u.walkT += dt;
    }
    this.units = this.units.filter((u) => u.dieT === 0 || u.dieT > 0);

    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.localAge += dt;
    }
    this.projectiles = this.projectiles.filter((p) => p.localAge < 1.5 && p.x > -40 && p.x < FIELD_W + 40);

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const f of this.floats) {
      f.y -= 34 * dt;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.strikes) {
      s.t += dt;
      if (!s.exploded && s.t >= 0.32) {
        s.exploded = true;
        this.events.push('boom');
        this.shake = Math.min(0.6, this.shake + 0.08);
        for (let i = 0; i < 8; i++) {
          this.spawnParticle(s.x + (Math.random() - 0.5) * 20, s.y - Math.random() * 14,
            (Math.random() - 0.5) * 200, -Math.random() * 160, 0.5, 3.5, '#f97316', 320);
        }
      }
    }
    this.strikes = this.strikes.filter((s) => s.t < 0.85);
  }

  private spawnParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, gravity: number) {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity });
  }

  getSnapshot(): ProductionHudSnapshot {
    const canEvolve = this.ageIdx.player < AGES.length - 1 && this.xp >= EVOLVE_COSTS[this.ageIdx.player];
    return {
      gold: Math.floor(this.gold),
      xp: Math.floor(this.xp),
      ageIdx: this.ageIdx.player,
      baseHp: Math.max(0, Math.ceil(this.baseHp.player)),
      baseMax: this.baseMax.player,
      enemyBaseHp: Math.max(0, Math.ceil(this.baseHp.enemy)),
      enemyBaseMax: this.baseMax.enemy,
      enemyAgeIdx: this.ageIdx.enemy,
      specialCd: Math.max(0, this.specialCd),
      specialMax: AGES[this.ageIdx.player].special.cooldown,
      canEvolve,
      evolveCost: this.ageIdx.player < AGES.length - 1 ? EVOLVE_COSTS[this.ageIdx.player] : 0,
      over: this.over,
      winner: this.winner,
      kills: this.kills,
      time: this.time,
      turretsUsed: this.turrets.player.filter(Boolean).length,
      productionQueue: this.productionQueues.player.map((entry) => ({ ...entry })),
      productionQueueCapacity: UNIT_QUEUE_CAP,
    };
  }
}
