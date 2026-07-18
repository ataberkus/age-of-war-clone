export type Side = 'player' | 'enemy';

export type ProjectileKind =
  | 'stone'
  | 'arrow'
  | 'bolt'
  | 'bullet'
  | 'shell'
  | 'rocket'
  | 'laser'
  | 'plasma';

export interface UnitDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  hp: number;
  damage: number;
  range: number;
  speed: number; // px per second
  attackTime: number; // seconds between attacks
  rewardGold: number;
  rewardXp: number;
  ranged: boolean;
  projectile?: ProjectileKind;
  splash?: number;
  scale: number; // render scale
  mount?: 'dino' | 'horse' | 'cannon' | 'tank' | 'mech';
}

export interface ProductionEntry {
  def: UnitDef;
  ageIdx: number;
  unitIdx: number;
  cost: number;
  duration: number;
  remaining: number;
}

export interface ProductionQueueViewEntry {
  ageIdx: number;
  unitIdx: number;
  duration: number;
  remaining: number;
  ready: boolean;
}

export interface TurretDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  damage: number;
  range: number;
  attackTime: number;
  projectile: ProjectileKind;
  splash?: number;
}

export interface SpecialDef {
  id: string;
  name: string;
  icon: string;
  damage: number; // total damage spread over strikes
  cooldown: number;
}

export interface Theme {
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  ground: string;
  groundDark: string;
  hill: string;
  hillFar: string;
  accent: string;
  night?: boolean;
}

export interface AgeDef {
  name: string;
  icon: string;
  units: UnitDef[];
  turrets: TurretDef[];
  special: SpecialDef;
  theme: Theme;
}

export interface UnitEnt {
  uid: number;
  side: Side;
  def: UnitDef;
  x: number;
  yOff: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  attackAnim: number;
  walkT: number;
  flash: number;
  dieT: number; // >0 while dying
  speedJit: number;
}

export interface ProjectileEnt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  side: Side;
  damage: number;
  kind: ProjectileKind;
  splash: number;
  traveled: number;
  maxTravel: number;
  targetBase: boolean;
}

export interface TurretEnt {
  def: TurretDef;
  cooldown: number;
  aimT: number;
}

export interface ParticleEnt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  fade?: boolean;
}

export interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface StrikeFx {
  x: number;
  y: number; // ground y
  t: number; // elapsed
  kind: 'meteor' | 'arrow' | 'shell' | 'bomb' | 'beam';
  delay: number;
  exploded: boolean;
}

export interface DifficultyDef {
  name: string;
  income: number;
  aggro: number;
  smartness: number;
  spawnCd: number; // min seconds between AI unit spawns
  mountDelay: number; // seconds before AI may train mount/vehicle units
  startGoldBonus: number; // extra starting gold for the AI
}
