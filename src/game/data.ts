import type { AgeDef, DifficultyDef } from './types';

export const FIELD_W = 1600;
export const FIELD_H = 520;
export const GROUND_Y = 468;
export const PLAYER_BASE_X = 96;
export const ENEMY_BASE_X = 1504;
export const BASE_W = 150;
export const TURRET_SLOTS = 3;
export const START_BASE_HP = 700;
export const EVOLVE_HP_BONUS = 150;
export const START_GOLD = 125;
export const EVOLVE_COSTS = [210, 780, 2250, 5600];
export const PASSIVE_GOLD = 2.6;
export const PASSIVE_XP = 1.6;

export const UNIT_QUEUE_CAP = 20;
export const LIVING_UNIT_CAP = 50;
export const UNIT_TRAINING_TIMES = [1.5, 2.5, 4.0] as const;

export function unitTrainingTime(unitIdx: number): number {
  const duration = UNIT_TRAINING_TIMES[unitIdx];
  if (duration === undefined) throw new Error(`Invalid unit slot: ${unitIdx}`);
  return duration;
}

export const AGES: AgeDef[] = [
  {
    name: 'Stone Age',
    icon: '🦴',
    units: [
      {
        id: 'clubman', name: 'Clubman', icon: '🏏', cost: 15, hp: 75, damage: 12,
        range: 26, speed: 42, attackTime: 0.9, rewardGold: 6, rewardXp: 4,
        ranged: false, scale: 1,
      },
      {
        id: 'slingshot', name: 'Slingshot', icon: '🪨', cost: 25, hp: 42, damage: 10,
        range: 150, speed: 38, attackTime: 1.1, rewardGold: 10, rewardXp: 6,
        ranged: true, projectile: 'stone', scale: 0.92,
      },
      {
        id: 'dino', name: 'Dino Rider', icon: '🦖', cost: 100, hp: 200, damage: 16,
        range: 40, speed: 36, attackTime: 1.2, rewardGold: 40, rewardXp: 22,
        ranged: false, scale: 1.35, mount: 'dino',
      },
    ],
    turrets: [
      { id: 'rocktower', name: 'Rock Tower', icon: '🗿', cost: 220, damage: 16, range: 320, attackTime: 0.9, projectile: 'stone' },
      { id: 'catapult', name: 'Catapult', icon: '💣', cost: 550, damage: 34, range: 390, attackTime: 2.4, projectile: 'shell', splash: 40 },
    ],
    special: { id: 'meteor', name: 'Meteor Shower', icon: '☄️', damage: 80, cooldown: 45 },
    theme: {
      skyTop: '#fde68a', skyMid: '#fdba74', skyBottom: '#fb923c',
      ground: '#a16207', groundDark: '#713f12', hill: '#d97706', hillFar: '#f59e0b',
      accent: '#78350f',
    },
  },
  {
    name: 'Medieval Age',
    icon: '🏰',
    units: [
      {
        id: 'swordsman', name: 'Swordsman', icon: '⚔️', cost: 50, hp: 115, damage: 17,
        range: 28, speed: 44, attackTime: 0.85, rewardGold: 20, rewardXp: 11,
        ranged: false, scale: 1,
      },
      {
        id: 'archer', name: 'Archer', icon: '🏹', cost: 75, hp: 58, damage: 15,
        range: 195, speed: 40, attackTime: 1.3, rewardGold: 28, rewardXp: 15,
        ranged: true, projectile: 'arrow', scale: 0.95,
      },
      {
        id: 'knight', name: 'Knight', icon: '🐴', cost: 260, hp: 470, damage: 42,
        range: 44, speed: 50, attackTime: 1.1, rewardGold: 105, rewardXp: 55,
        ranged: false, scale: 1.3, mount: 'horse',
      },
    ],
    turrets: [
      { id: 'arrowtower', name: 'Arrow Tower', icon: '🏹', cost: 420, damage: 24, range: 350, attackTime: 0.9, projectile: 'arrow' },
      { id: 'ballista', name: 'Ballista', icon: '🎯', cost: 900, damage: 58, range: 430, attackTime: 2.2, projectile: 'bolt' },
    ],
    special: { id: 'arrowstorm', name: 'Arrow Storm', icon: '🌧️', damage: 130, cooldown: 45 },
    theme: {
      skyTop: '#bae6fd', skyMid: '#7dd3fc', skyBottom: '#38bdf8',
      ground: '#4d7c0f', groundDark: '#365314', hill: '#65a30d', hillFar: '#84cc16',
      accent: '#1a2e05',
    },
  },
  {
    name: 'Renaissance',
    icon: '🎭',
    units: [
      {
        id: 'dueler', name: 'Dueler', icon: '🤺', cost: 150, hp: 200, damage: 30,
        range: 30, speed: 47, attackTime: 0.8, rewardGold: 60, rewardXp: 32,
        ranged: false, scale: 1.02,
      },
      {
        id: 'musketeer', name: 'Musketeer', icon: '🔫', cost: 200, hp: 100, damage: 30,
        range: 235, speed: 40, attackTime: 1.5, rewardGold: 80, rewardXp: 42,
        ranged: true, projectile: 'bullet', scale: 0.97,
      },
      {
        id: 'cannon', name: 'Cannon', icon: '💥', cost: 800, hp: 780, damage: 95,
        range: 265, speed: 22, attackTime: 2.8, rewardGold: 320, rewardXp: 170,
        ranged: true, projectile: 'shell', splash: 45, scale: 1.3, mount: 'cannon',
      },
    ],
    turrets: [
      { id: 'guntower', name: 'Gun Tower', icon: '🔫', cost: 800, damage: 42, range: 370, attackTime: 0.8, projectile: 'bullet' },
      { id: 'bombard', name: 'Bombard', icon: '🧨', cost: 1600, damage: 98, range: 450, attackTime: 2.6, projectile: 'shell', splash: 50 },
    ],
    special: { id: 'barrage', name: 'Cannon Barrage', icon: '💣', damage: 210, cooldown: 45 },
    theme: {
      skyTop: '#99f6e4', skyMid: '#5eead4', skyBottom: '#2dd4bf',
      ground: '#78716c', groundDark: '#57534e', hill: '#a8a29e', hillFar: '#d6d3d1',
      accent: '#292524',
    },
  },
  {
    name: 'Modern Age',
    icon: '🪖',
    units: [
      {
        id: 'soldier', name: 'Soldier', icon: '🪖', cost: 320, hp: 330, damage: 42,
        range: 135, speed: 50, attackTime: 0.8, rewardGold: 128, rewardXp: 68,
        ranged: true, projectile: 'bullet', scale: 1,
      },
      {
        id: 'bazooka', name: 'Bazooka', icon: '🚀', cost: 450, hp: 170, damage: 62,
        range: 265, speed: 42, attackTime: 1.8, rewardGold: 180, rewardXp: 95,
        ranged: true, projectile: 'rocket', splash: 34, scale: 0.98,
      },
      {
        id: 'tank', name: 'Tank', icon: '🛡️', cost: 1600, hp: 1550, damage: 175,
        range: 210, speed: 30, attackTime: 2.4, rewardGold: 640, rewardXp: 340,
        ranged: true, projectile: 'shell', splash: 55, scale: 1.45, mount: 'tank',
      },
    ],
    turrets: [
      { id: 'mgtower', name: 'MG Turret', icon: '🔫', cost: 1500, damage: 70, range: 390, attackTime: 0.7, projectile: 'bullet' },
      { id: 'rockettower', name: 'Rocket Turret', icon: '🚀', cost: 3000, damage: 170, range: 470, attackTime: 2.4, projectile: 'rocket', splash: 60 },
    ],
    special: { id: 'bombing', name: 'Bombing Run', icon: '✈️', damage: 330, cooldown: 45 },
    theme: {
      skyTop: '#cbd5e1', skyMid: '#94a3b8', skyBottom: '#64748b',
      ground: '#44403c', groundDark: '#292524', hill: '#57534e', hillFar: '#78716c',
      accent: '#0c0a09',
    },
  },
  {
    name: 'Future Age',
    icon: '🤖',
    units: [
      {
        id: 'bladebot', name: 'Blade Bot', icon: '⚡', cost: 650, hp: 580, damage: 85,
        range: 38, speed: 56, attackTime: 0.7, rewardGold: 260, rewardXp: 140,
        ranged: false, scale: 1.05,
      },
      {
        id: 'blaster', name: 'Blaster', icon: '🔆', cost: 850, hp: 310, damage: 95,
        range: 285, speed: 46, attackTime: 1.3, rewardGold: 340, rewardXp: 185,
        ranged: true, projectile: 'laser', scale: 1,
      },
      {
        id: 'warmachine', name: 'War Machine', icon: '🦾', cost: 4000, hp: 3500, damage: 340,
        range: 245, speed: 26, attackTime: 2.2, rewardGold: 1600, rewardXp: 850,
        ranged: true, projectile: 'plasma', splash: 75, scale: 1.6, mount: 'mech',
      },
    ],
    turrets: [
      { id: 'lasertower', name: 'Laser Turret', icon: '🔮', cost: 3000, damage: 135, range: 430, attackTime: 0.6, projectile: 'laser' },
      { id: 'plasmatower', name: 'Plasma Turret', icon: '🌀', cost: 6000, damage: 310, range: 510, attackTime: 2.2, projectile: 'plasma', splash: 70 },
    ],
    special: { id: 'ionbeam', name: 'Ion Cannon', icon: '🌐', damage: 520, cooldown: 45 },
    theme: {
      skyTop: '#1e1b4b', skyMid: '#312e81', skyBottom: '#4c1d95',
      ground: '#1e293b', groundDark: '#0f172a', hill: '#334155', hillFar: '#475569',
      accent: '#a78bfa', night: true,
    },
  },
];

export const DIFFICULTIES: DifficultyDef[] = [
  { name: 'Easy', income: 0.55, aggro: 0.35, smartness: 0.2, spawnCd: 4.0, mountDelay: 90, startGoldBonus: 0 },
  { name: 'Normal', income: 0.9, aggro: 0.55, smartness: 0.5, spawnCd: 2.4, mountDelay: 45, startGoldBonus: 0 },
  { name: 'Hard', income: 1.3, aggro: 0.9, smartness: 1.0, spawnCd: 1.4, mountDelay: 20, startGoldBonus: 50 },
  { name: 'Insane', income: 1.8, aggro: 1.0, smartness: 1.0, spawnCd: 0.9, mountDelay: 8, startGoldBonus: 150 },
];

export function other(side: 'player' | 'enemy'): 'player' | 'enemy' {
  return side === 'player' ? 'enemy' : 'player';
}

export const UNIT_DEFS: Record<string, import('./types').UnitDef> = {};
export const TURRET_DEFS: Record<string, import('./types').TurretDef> = {};
for (const a of AGES) {
  for (const u of a.units) UNIT_DEFS[u.id] = u;
  for (const t of a.turrets) TURRET_DEFS[t.id] = t;
}
