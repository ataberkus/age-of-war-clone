import {
  ENEMY_BASE_X,
  LIVING_UNIT_CAP,
  PLAYER_BASE_X,
  UNIT_QUEUE_CAP,
  unitTrainingTime,
} from './data';
import { GameEngine, type HudSnapshot } from './engine';
import type {
  DifficultyDef,
  ProductionEntry,
  ProductionQueueViewEntry,
  Side,
  UnitDef,
} from './types';

declare module './engine' {
  interface GameEngine {
    readonly productionQueues: Record<Side, ProductionEntry[]>;
    cancelQueuedUnit(side: Side, queueIndex: number): boolean;
  }
}

// Compatibility export: existing callers can keep the production-engine name
// while the actual constructor remains the original GameEngine.
export { GameEngine as ProductionGameEngine };

export interface ProductionHudSnapshot extends HudSnapshot {
  productionQueue: ProductionQueueViewEntry[];
  productionQueueCapacity: number;
}

interface ProductionState {
  queues: Record<Side, ProductionEntry[]>;
}

const productionStates = new WeakMap<GameEngine, ProductionState>();
let localCancelHandler: ((queueIndex: number) => void) | null = null;

function clearQueues(state: ProductionState) {
  state.queues.player.length = 0;
  state.queues.enemy.length = 0;
}

function ensureProductionState(engine: GameEngine): ProductionState {
  const existing = productionStates.get(engine);
  if (existing) return existing;

  const state: ProductionState = {
    queues: { player: [], enemy: [] },
  };
  productionStates.set(engine, state);

  let overState = engine.over;
  Object.defineProperty(engine, 'over', {
    configurable: true,
    enumerable: true,
    get: () => overState,
    set: (value: boolean) => {
      overState = value;
      if (value) clearQueues(state);
    },
  });

  return state;
}

export function getProductionQueues(engine: GameEngine): Record<Side, ProductionEntry[]> {
  return ensureProductionState(engine).queues;
}

export function getProductionQueueView(engine: GameEngine, side: Side): ProductionQueueViewEntry[] {
  return getProductionQueues(engine)[side].map((entry) => ({
    ageIdx: entry.ageIdx,
    unitIdx: entry.unitIdx,
    duration: entry.duration,
    remaining: Math.max(0, entry.remaining),
    ready: entry.remaining <= 0,
  }));
}

export function cancelQueuedUnit(engine: GameEngine, side: Side, queueIndex: number): boolean {
  if (engine.over || queueIndex <= 0) {
    if (side === 'player') engine.events.push('deny');
    return false;
  }

  const queue = getProductionQueues(engine)[side];
  const entry = queue[queueIndex];
  if (!entry) {
    if (side === 'player') engine.events.push('deny');
    return false;
  }

  queue.splice(queueIndex, 1);
  engine.gold[side] += entry.cost;
  if (side === 'player') engine.events.push('click');
  return true;
}

export function setLocalQueueCancelHandler(handler: ((queueIndex: number) => void) | null) {
  localCancelHandler = handler;
}

export function cancelLocalQueuedUnit(queueIndex: number) {
  localCancelHandler?.(queueIndex);
}

function livingUnitCount(engine: GameEngine, side: Side): number {
  return engine.units.reduce(
    (count, unit) => count + (unit.side === side && unit.dieT === 0 ? 1 : 0),
    0,
  );
}

function spawnQueuedUnit(engine: GameEngine, side: Side, def: UnitDef) {
  const internals = engine as unknown as { uidCounter: number };
  engine.units.push({
    uid: internals.uidCounter++,
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
}

function updateProduction(engine: GameEngine, dt: number) {
  const queues = getProductionQueues(engine);
  for (const side of ['player', 'enemy'] as Side[]) {
    const active = queues[side][0];
    if (!active) continue;

    active.remaining = Math.max(0, active.remaining - dt);
    if (active.remaining > 0) continue;
    if (livingUnitCount(engine, side) >= LIVING_UNIT_CAP) continue;

    spawnQueuedUnit(engine, side, active.def);
    queues[side].shift();
  }
}

Object.defineProperty(GameEngine.prototype, 'productionQueues', {
  configurable: true,
  enumerable: false,
  get(this: GameEngine) {
    return getProductionQueues(this);
  },
});

GameEngine.prototype.cancelQueuedUnit = function cancelProductionEntry(
  side: Side,
  queueIndex: number,
): boolean {
  return cancelQueuedUnit(this, side, queueIndex);
};

const originalBuyUnit = GameEngine.prototype.buyUnit;
const originalGetSnapshot = GameEngine.prototype.getSnapshot;
const originalRunAI = GameEngine.prototype.runAI;
const originalUpdate = GameEngine.prototype.update;

void originalBuyUnit; // documents that immediate spawning is intentionally replaced.

GameEngine.prototype.buyUnit = function buyQueuedUnit(side: Side, unitIdx: number): boolean {
  if (this.over) return false;

  const def = this.age(side).units[unitIdx];
  const queue = getProductionQueues(this)[side];
  if (!def || queue.length >= UNIT_QUEUE_CAP || this.gold[side] < def.cost) {
    if (side === 'player') this.events.push('deny');
    return false;
  }

  const duration = unitTrainingTime(unitIdx);
  this.gold[side] -= def.cost;
  queue.push({
    def,
    ageIdx: this.ageIdx[side],
    unitIdx,
    cost: def.cost,
    duration,
    remaining: duration,
  });

  if (side === 'player') this.events.push('buy');
  return true;
};

GameEngine.prototype.getSnapshot = function getProductionSnapshot(): ProductionHudSnapshot {
  const snapshot = originalGetSnapshot.call(this);
  setLocalQueueCancelHandler((queueIndex) => {
    cancelQueuedUnit(this, 'player', queueIndex);
  });
  return {
    ...snapshot,
    productionQueue: getProductionQueueView(this, 'player'),
    productionQueueCapacity: UNIT_QUEUE_CAP,
  };
};

GameEngine.prototype.runAI = function runProductionAI(side: Side, difficulty: DifficultyDef) {
  if (getProductionQueues(this)[side].length >= UNIT_QUEUE_CAP) return;
  originalRunAI.call(this, side, difficulty);
};

GameEngine.prototype.update = function updateWithProduction(dt: number) {
  ensureProductionState(this);
  if (this.paused || this.over) {
    originalUpdate.call(this, dt);
    return;
  }

  originalUpdate.call(this, dt);
  if (!this.over) updateProduction(this, dt);
};
