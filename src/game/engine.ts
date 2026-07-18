import {
  AGES, DIFFICULTIES, FIELD_W, GROUND_Y, PLAYER_BASE_X, ENEMY_BASE_X,
  TURRET_SLOTS, START_BASE_HP, EVOLVE_HP_BONUS, START_GOLD, EVOLVE_COSTS,
  PASSIVE_GOLD, PASSIVE_XP, other,
} from './data';
import type {
  Side, UnitEnt, ProjectileEnt, TurretEnt, ParticleEnt, FloatText,
  StrikeFx, UnitDef, ProjectileKind, DifficultyDef,
} from './types';
import type { SfxName } from './audio';

export const PROJ_SPEED: Record<ProjectileKind, number> = {
  stone: 320, arrow: 480, bolt: 580, bullet: 780, shell: 360, rocket: 430, laser: 980, plasma: 480,
};

export function unitHeight(def: UnitDef): number {
  const base =
    def.mount === 'mech' ? 62 :
    def.mount === 'horse' ? 50 :
    def.mount === 'dino' ? 46 :
    def.mount === 'tank' ? 40 :
    def.mount === 'cannon' ? 36 : 38;
  return base * def.scale;
}

export function turretPos(side: Side, slot: number): { x: number; y: number } {
  const bx = side === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X;
  const dir = side === 'player' ? 1 : -1;
  return { x: bx + dir * (slot % 2 === 0 ? 8 : 38), y: GROUND_Y - 128 - slot * 58 };
}

export interface HudSnapshot {
  gold: number;
  xp: number;
  ageIdx: number;
  baseHp: number;
  baseMax: number;
  enemyBaseHp: number;
  enemyBaseMax: number;
  enemyAgeIdx: number;
  specialCd: number;
  specialMax: number;
  canEvolve: boolean;
  evolveCost: number;
  over: boolean;
  winner: Side | null;
  kills: number;
  time: number;
  turretsUsed: number;
}

interface SpecialState {
  side: Side;
  ticksLeft: number;
  next: number;
  kind: StrikeFx['kind'];
  damage: number;
}

export class GameEngine {
  difficultyIdx: number;
  time = 0;
  gold: Record<Side, number> = { player: START_GOLD, enemy: START_GOLD };
  xp: Record<Side, number> = { player: 0, enemy: 0 };
  ageIdx: Record<Side, number> = { player: 0, enemy: 0 };
  baseHp: Record<Side, number> = { player: START_BASE_HP, enemy: START_BASE_HP };
  baseMax: Record<Side, number> = { player: START_BASE_HP, enemy: START_BASE_HP };
  units: UnitEnt[] = [];
  projectiles: ProjectileEnt[] = [];
  particles: ParticleEnt[] = [];
  floats: FloatText[] = [];
  strikes: StrikeFx[] = [];
  turrets: Record<Side, (TurretEnt | null)[]> = {
    player: Array(TURRET_SLOTS).fill(null),
    enemy: Array(TURRET_SLOTS).fill(null),
  };
  specialCd: Record<Side, number> = { player: 0, enemy: 0 };
  baseFlash: Record<Side, number> = { player: 0, enemy: 0 };
  kills: Record<Side, number> = { player: 0, enemy: 0 };
  over = false;
  winner: Side | null = null;
  paused = false;
  aiEnabled = true;
  shake = 0;
  events: SfxName[] = [];

  private uidCounter = 1;
  private aiT = 0;
  private aiSpawnCd: Record<Side, number> = { player: 4, enemy: 4 };
  private aiWaveBudget: Record<Side, number> = { player: 0, enemy: 0 };
  /** income multiplier for the player side (used by AI-vs-AI simulations) */
  playerIncomeMult = 1;
  private specials: SpecialState[] = [];

  constructor(difficultyIdx: number) {
    this.difficultyIdx = difficultyIdx;
    this.gold.enemy += DIFFICULTIES[difficultyIdx].startGoldBonus;
  }

  age(side: Side) {
    return AGES[this.ageIdx[side]];
  }

  evolveCost(side: Side): number {
    return this.ageIdx[side] < AGES.length - 1 ? EVOLVE_COSTS[this.ageIdx[side]] : 0;
  }

  canEvolve(side: Side): boolean {
    return this.ageIdx[side] < AGES.length - 1 && this.xp[side] >= this.evolveCost(side);
  }

  evolve(side: Side): boolean {
    if (!this.canEvolve(side) || this.over) return false;
    this.xp[side] -= this.evolveCost(side);
    this.ageIdx[side] += 1;
    this.baseMax[side] += EVOLVE_HP_BONUS;
    this.baseHp[side] = Math.min(this.baseMax[side], this.baseHp[side] + EVOLVE_HP_BONUS);
    if (side === 'player') this.events.push('evolve');
    const bx = side === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X;
    for (let i = 0; i < 26; i++) {
      this.spawnParticle(bx + (Math.random() - 0.5) * 90, GROUND_Y - Math.random() * 160,
        (Math.random() - 0.5) * 120, -Math.random() * 140, 0.9, 4, '#fbbf24', 220);
    }
    return true;
  }

  buyUnit(side: Side, idx: number): boolean {
    if (this.over) return false;
    const def = this.age(side).units[idx];
    if (!def || this.gold[side] < def.cost) {
      if (side === 'player') this.events.push('deny');
      return false;
    }
    const alive = this.units.reduce((n, u) => n + (u.side === side && u.dieT === 0 ? 1 : 0), 0);
    if (alive >= 14) {
      if (side === 'player') this.events.push('deny');
      return false;
    }
    this.gold[side] -= def.cost;
    this.units.push({
      uid: this.uidCounter++,
      side,
      def,
      x: side === 'player' ? PLAYER_BASE_X + 62 : ENEMY_BASE_X - 62,
      yOff: Math.random() * 10 - 5,
      hp: def.hp,
      maxHp: def.hp,
      cooldown: 0.25 + Math.random() * 0.2,
      attackAnim: 0,
      walkT: Math.random() * 2,
      flash: 0,
      dieT: 0,
      speedJit: 0.92 + Math.random() * 0.16,
    });
    if (side === 'player') this.events.push('buy');
    return true;
  }

  buyTurret(side: Side, idx: number): boolean {
    if (this.over) return false;
    const def = this.age(side).turrets[idx];
    const slot = this.turrets[side].findIndex((t) => t === null);
    if (!def || slot < 0 || this.gold[side] < def.cost) {
      if (side === 'player') this.events.push('deny');
      return false;
    }
    this.gold[side] -= def.cost;
    this.turrets[side][slot] = { def, cooldown: 0.4, aimT: 0 };
    if (side === 'player') this.events.push('turret');
    return true;
  }

  useSpecial(side: Side): boolean {
    if (this.over || this.specialCd[side] > 0) {
      if (side === 'player') this.events.push('deny');
      return false;
    }
    const def = this.age(side).special;
    this.specialCd[side] = def.cooldown;
    const kindMap: Record<string, StrikeFx['kind']> = {
      meteor: 'meteor', arrowstorm: 'arrow', barrage: 'shell', bombing: 'bomb', ionbeam: 'beam',
    };
    this.specials.push({
      side,
      ticksLeft: 9,
      next: 0.15,
      kind: kindMap[def.id] ?? 'meteor',
      damage: def.damage / 9,
    });
    this.events.push('special');
    return true;
  }

  getSnapshot(): HudSnapshot {
    return {
      gold: Math.floor(this.gold.player),
      xp: Math.floor(this.xp.player),
      ageIdx: this.ageIdx.player,
      baseHp: Math.max(0, Math.ceil(this.baseHp.player)),
      baseMax: this.baseMax.player,
      enemyBaseHp: Math.max(0, Math.ceil(this.baseHp.enemy)),
      enemyBaseMax: this.baseMax.enemy,
      enemyAgeIdx: this.ageIdx.enemy,
      specialCd: Math.max(0, this.specialCd.player),
      specialMax: this.age('player').special.cooldown,
      canEvolve: this.canEvolve('player'),
      evolveCost: this.evolveCost('player'),
      over: this.over,
      winner: this.winner,
      kills: this.kills.player,
      time: this.time,
      turretsUsed: this.turrets.player.filter(Boolean).length,
    };
  }

  // ---------------- core update ----------------

  update(dt: number) {
    if (this.paused || this.over) return;
    this.time += dt;
    const diff = DIFFICULTIES[this.difficultyIdx];

    // passive income
    this.gold.player += (PASSIVE_GOLD + this.ageIdx.player * 0.35) * this.playerIncomeMult * dt;
    this.xp.player += PASSIVE_XP * this.playerIncomeMult * dt;
    this.gold.enemy += (PASSIVE_GOLD + this.ageIdx.enemy * 0.35) * diff.income * dt;
    this.xp.enemy += PASSIVE_XP * diff.income * dt;

    // slow base repair
    for (const sd of ['player', 'enemy'] as Side[]) {
      this.baseHp[sd] = Math.min(this.baseMax[sd], this.baseHp[sd] + 1.2 * dt);
    }
    this.specialCd.player = Math.max(0, this.specialCd.player - dt);
    this.specialCd.enemy = Math.max(0, this.specialCd.enemy - dt);
    this.baseFlash.player = Math.max(0, this.baseFlash.player - dt);
    this.baseFlash.enemy = Math.max(0, this.baseFlash.enemy - dt);
    this.shake = Math.max(0, this.shake - dt * 1.4);

    // AI (disabled in online matches — the "enemy" is a human)
    this.aiT += dt;
    this.aiSpawnCd.player -= dt;
    this.aiSpawnCd.enemy -= dt;
    if (this.aiEnabled && this.aiT >= 0.35) {
      this.runAI('enemy', DIFFICULTIES[this.difficultyIdx]);
      this.aiT = 0;
    }

    this.updateUnits(dt);
    this.updateProjectiles(dt);
    this.updateTurrets(dt);
    this.updateSpecials(dt);

    // fx
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);

    for (const f of this.floats) {
      f.y -= 34 * dt;
      f.life -= dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.strikes) {
      s.t += dt;
      if (!s.exploded && s.t >= 0.32) {
        s.exploded = true;
        this.explosionFx(s.x, s.y, s.kind);
      }
    }
    this.strikes = this.strikes.filter((s) => s.t < 0.85);
  }

  // ---------------- units ----------------

  private updateUnits(dt: number) {
    for (const u of this.units) {
      if (u.dieT > 0) {
        u.dieT -= dt;
        continue;
      }
      u.flash = Math.max(0, u.flash - dt);
      u.attackAnim = Math.max(0, u.attackAnim - dt);
      u.cooldown -= dt;

      const dir = u.side === 'player' ? 1 : -1;
      let target: UnitEnt | null = null;
      let best = Infinity;
      for (const e of this.units) {
        if (e.side === u.side || e.dieT !== 0) continue;
        const dx = (e.x - u.x) * dir;
        if (dx < -16) continue;
        const dist = Math.abs(e.x - u.x);
        const reach = u.def.range + (e.def.mount ? 26 : 12);
        if (dist <= reach && dist < best) {
          best = dist;
          target = e;
        }
      }

      const baseX = u.side === 'player' ? ENEMY_BASE_X : PLAYER_BASE_X;
      const distBase = (baseX - u.x) * dir;
      const hittingBase = !target && distBase <= u.def.range + 62;

      if (target || hittingBase) {
        if (u.cooldown <= 0) {
          u.cooldown = u.def.attackTime;
          u.attackAnim = 0.32;
          if (target) this.attackUnit(u, target);
          else this.attackBase(u);
        }
      } else {
        u.walkT += dt;
        u.x += dir * u.def.speed * u.speedJit * dt;
        u.x = Math.max(50, Math.min(FIELD_W - 50, u.x));
      }
    }
    this.units = this.units.filter((u) => u.dieT === 0 || u.dieT > 0);
  }

  private attackUnit(u: UnitEnt, target: UnitEnt) {
    const dir = u.side === 'player' ? 1 : -1;
    if (u.def.ranged && u.def.projectile) {
      const h = unitHeight(u.def);
      const sx = u.x + dir * 16 * u.def.scale;
      const sy = GROUND_Y + u.yOff - h * 0.62;
      const th = unitHeight(target.def);
      const tx = target.x;
      const ty = GROUND_Y + target.yOff - th * 0.55;
      const dist = Math.max(30, Math.abs(tx - sx));
      const speed = PROJ_SPEED[u.def.projectile];
      this.projectiles.push({
        x: sx, y: sy,
        vx: ((tx - sx) / dist) * speed,
        vy: ((ty - sy) / dist) * speed,
        side: u.side,
        damage: u.def.damage,
        kind: u.def.projectile,
        splash: u.def.splash ?? 0,
        traveled: 0,
        maxTravel: u.def.range + 90,
        targetBase: false,
      });
      this.events.push(u.def.projectile === 'arrow' || u.def.projectile === 'bolt' ? 'arrow' : 'shoot');
    } else {
      this.damageUnit(target, u.def.damage, u.side);
      this.events.push('melee');
      const h = unitHeight(target.def);
      for (let i = 0; i < 3; i++) {
        this.spawnParticle(target.x + (Math.random() - 0.5) * 14, GROUND_Y + target.yOff - h * 0.5,
          (Math.random() - 0.5) * 90, -Math.random() * 80, 0.3, 2.5, '#fde68a', 300);
      }
    }
  }

  private attackBase(u: UnitEnt) {
    const dir = u.side === 'player' ? 1 : -1;
    const enemySide = other(u.side);
    if (u.def.ranged && u.def.projectile) {
      const h = unitHeight(u.def);
      const baseX = u.side === 'player' ? ENEMY_BASE_X : PLAYER_BASE_X;
      const sx = u.x + dir * 16 * u.def.scale;
      const sy = GROUND_Y + u.yOff - h * 0.62;
      const ty = GROUND_Y - 70 - Math.random() * 60;
      const dist = Math.max(30, Math.abs(baseX - 30 * dir - sx));
      const speed = PROJ_SPEED[u.def.projectile];
      this.projectiles.push({
        x: sx, y: sy,
        vx: ((baseX - 30 * dir - sx) / dist) * speed,
        vy: ((ty - sy) / dist) * speed,
        side: u.side,
        damage: u.def.damage,
        kind: u.def.projectile,
        splash: 0,
        traveled: 0,
        maxTravel: u.def.range + 130,
        targetBase: true,
      });
      this.events.push(u.def.projectile === 'arrow' || u.def.projectile === 'bolt' ? 'arrow' : 'shoot');
    } else {
      this.damageBase(enemySide, u.def.damage);
      this.events.push('basehit');
    }
  }

  private damageUnit(target: UnitEnt, dmg: number, bySide: Side) {
    if (target.dieT !== 0) return;
    target.hp -= dmg;
    target.flash = 0.12;
    if (target.hp <= 0) {
      target.dieT = 0.45;
      this.gold[bySide] += target.def.rewardGold;
      this.xp[bySide] += target.def.rewardXp;
      this.kills[bySide] += 1;
      if (bySide === 'player') {
        this.floats.push({
          x: target.x, y: GROUND_Y + target.yOff - unitHeight(target.def) - 12,
          text: `+${target.def.rewardGold}`, color: '#fbbf24', life: 0.9, maxLife: 0.9,
        });
      }
      this.events.push('die');
      const h = unitHeight(target.def);
      const col = target.side === 'player' ? '#60a5fa' : '#f87171';
      for (let i = 0; i < 8; i++) {
        this.spawnParticle(target.x, GROUND_Y + target.yOff - h * 0.4,
          (Math.random() - 0.5) * 160, -Math.random() * 130, 0.55, 3, col, 340);
      }
    }
  }

  private damageBase(side: Side, dmg: number) {
    if (this.over) return;
    this.baseHp[side] -= dmg * 0.55;
    this.baseFlash[side] = 0.15;
    this.shake = Math.min(0.5, this.shake + 0.08);
    const bx = side === 'player' ? PLAYER_BASE_X : ENEMY_BASE_X;
    for (let i = 0; i < 4; i++) {
      this.spawnParticle(bx + (Math.random() - 0.5) * 60, GROUND_Y - 40 - Math.random() * 100,
        (Math.random() - 0.5) * 100, -Math.random() * 90, 0.4, 3, '#d6d3d1', 300);
    }
    if (this.baseHp[side] <= 0) {
      this.baseHp[side] = 0;
      this.over = true;
      this.winner = other(side);
      this.shake = 1;
      for (let i = 0; i < 60; i++) {
        this.spawnParticle(bx, GROUND_Y - 80,
          (Math.random() - 0.5) * 380, -Math.random() * 320, 1.4, 5,
          ['#f97316', '#ef4444', '#fbbf24', '#a8a29e'][i % 4], 300);
      }
      this.events.push(this.winner === 'player' ? 'win' : 'lose');
    }
  }

  // ---------------- projectiles ----------------

  private updateProjectiles(dt: number) {
    const keep: ProjectileEnt[] = [];
    for (const p of this.projectiles) {
      const step = Math.hypot(p.vx, p.vy) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.traveled += step;
      let dead = false;

      // hit units
      for (const e of this.units) {
        if (e.side === p.side || e.dieT !== 0) continue;
        const h = unitHeight(e.def);
        if (Math.abs(e.x - p.x) < 15 && p.y > GROUND_Y + e.yOff - h && p.y < GROUND_Y + e.yOff + 8) {
          this.damageUnit(e, p.damage, p.side);
          if (p.splash > 0) this.splashDamage(p.x, p.side, p.damage, p.splash, e.uid);
          if (p.kind === 'shell' || p.kind === 'rocket' || p.kind === 'plasma') {
            this.explosionFx(p.x, p.y, 'shell');
            this.events.push('boom');
          }
          dead = true;
          break;
        }
      }

      // hit base
      if (!dead && p.targetBase) {
        const baseX = p.side === 'player' ? ENEMY_BASE_X : PLAYER_BASE_X;
        const dir = p.side === 'player' ? 1 : -1;
        if ((baseX - 34 - p.x) * dir <= 0) {
          this.damageBase(other(p.side), p.damage);
          this.explosionFx(p.x, p.y, 'shell');
          this.events.push('basehit');
          dead = true;
        }
      }

      if (!dead && (p.traveled > p.maxTravel || p.x < 20 || p.x > FIELD_W - 20 || p.y > GROUND_Y + 20)) {
        dead = true;
      }
      if (!dead) keep.push(p);
    }
    this.projectiles = keep;
  }

  private splashDamage(x: number, side: Side, dmg: number, radius: number, exceptUid: number) {
    for (const e of this.units) {
      if (e.side === side || e.dieT !== 0 || e.uid === exceptUid) continue;
      if (Math.abs(e.x - x) <= radius) this.damageUnit(e, dmg * 0.7, side);
    }
  }

  // ---------------- turrets ----------------

  private updateTurrets(dt: number) {
    for (const side of ['player', 'enemy'] as Side[]) {
      const list = this.turrets[side];
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t) continue;
        t.cooldown -= dt;
        t.aimT = Math.max(0, t.aimT - dt);
        if (t.cooldown > 0) continue;
        const pos = turretPos(side, i);
        let target: UnitEnt | null = null;
        let best = Infinity;
        for (const e of this.units) {
          if (e.side === side || e.dieT !== 0) continue;
          const dist = Math.abs(e.x - pos.x);
          if (dist <= t.def.range && dist < best) {
            best = dist;
            target = e;
          }
        }
        if (!target) continue;
        t.cooldown = t.def.attackTime;
        t.aimT = 0.15;
        const th = unitHeight(target.def);
        const tx = target.x;
        const ty = GROUND_Y + target.yOff - th * 0.55;
        const dist = Math.max(30, Math.hypot(tx - pos.x, ty - pos.y));
        const speed = PROJ_SPEED[t.def.projectile];
        this.projectiles.push({
          x: pos.x, y: pos.y,
          vx: ((tx - pos.x) / dist) * speed,
          vy: ((ty - pos.y) / dist) * speed,
          side,
          damage: t.def.damage,
          kind: t.def.projectile,
          splash: t.def.splash ?? 0,
          traveled: 0,
          maxTravel: t.def.range + 90,
          targetBase: false,
        });
        this.events.push(t.def.projectile === 'arrow' || t.def.projectile === 'bolt' ? 'arrow' : 'shoot');
      }
    }
  }

  // ---------------- specials ----------------

  private updateSpecials(dt: number) {
    for (const s of this.specials) {
      s.next -= dt;
      while (s.next <= 0 && s.ticksLeft > 0) {
        s.ticksLeft -= 1;
        s.next += 0.2;
        // strike the foe's half: right side for the enemy caster, mirrored for the player
        const zoneMin = s.side === 'enemy' ? FIELD_W * 0.4 : FIELD_W * 0.06;
        const zoneMax = s.side === 'enemy' ? FIELD_W * 0.94 : FIELD_W * 0.6;
        const x = zoneMin + Math.random() * (zoneMax - zoneMin);
        const targetSide = other(s.side);
        // damage enemies of the caster in that zone
        for (const e of this.units) {
          if (e.side !== targetSide || e.dieT !== 0) continue;
          if (Math.abs(e.x - x) <= 100) this.damageUnit(e, s.damage, s.side);
        }
        this.strikes.push({ x, y: GROUND_Y, t: 0, kind: s.kind, delay: 0, exploded: false });
        this.shake = Math.min(0.6, this.shake + 0.1);
      }
    }
    this.specials = this.specials.filter((s) => s.ticksLeft > 0);
  }

  // ---------------- AI ----------------

  /** AI decision tick for one side. Called by update() for the enemy; simulations
   *  can also call it for the player side to run AI-vs-AI matches. */
  runAI(side: Side, diff: DifficultyDef) {
    const foe: Side = side === 'enemy' ? 'player' : 'enemy';
    const age = this.age(side);
    const tier = Math.max(0, DIFFICULTIES.findIndex((d) => d === diff));

    // evolve as soon as possible
    if (this.canEvolve(side)) {
      this.evolve(side);
      return;
    }

    const myUnits = this.units.filter((u) => u.side === side && u.dieT === 0);
    const enemyCount = myUnits.length;
    const foeUnits = this.units.filter((u) => u.side === foe && u.dieT === 0);
    // threat = foe units pushing into my half of the field
    const threat = foeUnits.filter((u) =>
      side === 'enemy' ? u.x > FIELD_W * 0.55 : u.x < FIELD_W * 0.45,
    ).length;

    // special: smart AI waits for a cluster inside the strike zone
    const inZone = foeUnits.filter((u) =>
      side === 'enemy' ? u.x > FIELD_W * 0.38 : u.x < FIELD_W * 0.62,
    ).length;
    const specialThreshold = diff.smartness > 0.7 ? 4 : 3;
    if (this.specialCd[side] <= 0 && inZone >= specialThreshold && Math.random() < 0.3 + diff.smartness * 0.45) {
      this.useSpecial(side);
    }

    // turrets: smart AI establishes defense early
    const freeSlot = this.turrets[side].findIndex((t) => t === null);
    if (freeSlot >= 0) {
      const affordable = age.turrets
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => this.gold[side] >= t.cost * (1.25 - diff.smartness * 0.35));
      const turretChance = diff.smartness > 0.7 ? 0.5 : 0.3 * diff.aggro;
      if (affordable.length > 0 && Math.random() < turretChance) {
        const pick = affordable[affordable.length - 1];
        this.buyTurret(side, pick.i);
      }
    }

    // emergency defense: a wave is at the gates — spawn as fast as gold allows
    if (threat >= 2 && this.aiSpawnCd[side] <= 0.7) {
      const options = age.units
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => this.gold[side] >= u.cost && (!u.mount || this.time >= diff.mountDelay));
      if (options.length > 0) {
        const pick = options[options.length - 1];
        if (this.buyUnit(side, pick.i)) {
          this.aiSpawnCd[side] = 0.7;
          // double-tap a second defender when the treasury allows
          if (this.gold[side] >= age.units[0].cost * 3) this.buyUnit(side, 0);
        }
      }
      const slot = this.turrets[side].findIndex((t) => t === null);
      if (slot >= 0) {
        const t0 = age.turrets[0];
        if (this.gold[side] >= t0.cost) this.buyTurret(side, 0);
      }
      return;
    }

    // coordinated wave: unleash the banked burst
    if (this.aiWaveBudget[side] > 0) {
      if (this.aiSpawnCd[side] <= 0) {
        const options = age.units
          .map((u, i) => ({ u, i }))
          .filter(({ u }) => this.gold[side] >= u.cost);
        if (options.length > 0) {
          const pick = options[options.length - 1];
          if (this.buyUnit(side, pick.i)) {
            this.aiWaveBudget[side] -= 1;
            this.aiSpawnCd[side] = 0.45;
          } else {
            this.aiWaveBudget[side] = 0;
          }
        } else {
          this.aiWaveBudget[side] = 0;
        }
      }
      return;
    }

    const desired = Math.min(
      2 + Math.floor(this.time / 42) + tier + Math.min(threat, 3),
      8 + tier * 2,
    );

    // bank gold for a coordinated wave when the army is complete and it's safe
    if (diff.smartness >= 0.8 && threat === 0 && enemyCount >= desired) {
      const waveCost = age.units[Math.min(2, age.units.length - 1)].cost + age.units[0].cost * 2;
      if (this.gold[side] >= waveCost * 1.15) this.aiWaveBudget[side] = 3;
      return;
    }

    // don't feed cheap units into a clearly superior army — save for a heavy answer
    const outmatched = foeUnits.length >= enemyCount + 5;
    if (outmatched && diff.smartness >= 0.8 && this.gold[side] < age.units[Math.min(2, age.units.length - 1)].cost) {
      return;
    }

    if (enemyCount < desired && Math.random() < diff.aggro) {
      const options = age.units
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => this.gold[side] >= u.cost);
      if (options.length > 0) {
        let pick;
        const mountsAlive = myUnits.filter((u) => u.def.mount).length;
        const mountCap = this.ageIdx[side] === 0 ? 1 : 2;
        const rangedAlive = myUnits.filter((u) => u.def.ranged).length;
        const rangedRatio = enemyCount > 0 ? rangedAlive / enemyCount : 0;
        // composition: keep ranged support behind the melee line
        const wantRanged = diff.smartness >= 0.6 && rangedRatio < 0.35 && options.some((o) => o.u.ranged);
        if (wantRanged) {
          pick = options.filter((o) => o.u.ranged)[0];
        } else if (Math.random() < diff.smartness * 0.55) {
          pick = options[options.length - 1]; // strongest affordable
          if (pick.u.mount && (mountsAlive >= mountCap || this.time < diff.mountDelay)) pick = options[0];
        } else {
          const weights = options.map((_, idx) => Math.pow(0.55, idx));
          const total = weights.reduce((a, b) => a + b, 0);
          let r = Math.random() * total;
          pick = options[0];
          for (let k = 0; k < options.length; k++) {
            r -= weights[k];
            if (r <= 0) { pick = options[k]; break; }
          }
          if (pick.u.mount && this.time < diff.mountDelay) pick = options[0];
        }
        if (this.buyUnit(side, pick.i)) {
          // burst chance: field small waves instead of a steady trickle
          const burst = Math.random() < 0.45 && this.gold[side] >= age.units[0].cost;
          this.aiSpawnCd[side] = burst ? 0.55 : diff.spawnCd * (0.85 + Math.random() * 0.4);
        }
      }
    }
  }

  // ---------------- fx helpers ----------------

  spawnParticle(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, gravity: number) {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity });
  }

  private explosionFx(x: number, y: number, kind: StrikeFx['kind']) {
    const colors: Record<StrikeFx['kind'], string[]> = {
      meteor: ['#f97316', '#ef4444', '#fbbf24'],
      arrow: ['#d6d3d1', '#a8a29e', '#78716c'],
      shell: ['#f97316', '#78716c', '#fbbf24'],
      bomb: ['#ef4444', '#f97316', '#44403c'],
      beam: ['#a78bfa', '#22d3ee', '#f0abfc'],
    };
    for (let i = 0; i < 10; i++) {
      this.spawnParticle(x + (Math.random() - 0.5) * 20, y - Math.random() * 14,
        (Math.random() - 0.5) * 220, -Math.random() * 180, 0.5 + Math.random() * 0.3,
        3 + Math.random() * 3, colors[kind][i % 3], 320);
    }
  }
}
