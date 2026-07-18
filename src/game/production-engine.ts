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

export interface ProductionHudSnapshot extends HudSnapshot {
  productionQueue: ProductionQueueViewEntry[];
  productionQueueCapacity: number;
}

/**
 * Adds authoritative timed unit production without coupling queue state to React
 * or multiplayer clients. Combat remains in GameEngine; this subclass owns only
 * purchase commitments, production timers, and physical unit release.
 */
export class ProductionGameEngine extends GameEngine {
  productionQueues: Record<Side, ProductionEntry[]> = {
    player: [],
    enemy: [],
  };

  private productionUidCounter = 1;

  constructor(difficultyIdx: number) {
    super(difficultyIdx);
    let overState = this.over;
    Object.defineProperty(this, 'over', {
      configurable: true,
      enumerable: true,
      get: () => overState,
      set: (value: boolean) => {
        overState = value;
        if (value) this.clearProductionQueues();
      },
    });
  }

  override buyUnit(side: Side, unitIdx: number): boolean {
    if (this.over) return false;

    const def = this.age(side).units[unitIdx];
    const queue = this.productionQueues[side];
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
  }

  cancelQueuedUnit(side: Side, queueIndex: number): boolean {
    if (this.over || queueIndex <= 0) {
      if (side === 'player') this.events.push('deny');
      return false;
    }

    const queue = this.productionQueues[side];
    const entry = queue[queueIndex];
    if (!entry) {
      if (side === 'player') this.events.push('deny');
      return false;
    }

    queue.splice(queueIndex, 1);
    this.gold[side] += entry.cost;
    if (side === 'player') this.events.push('click');
    return true;
  }

  getProductionQueue(side: Side): ProductionQueueViewEntry[] {
    return this.productionQueues[side].map((entry) => ({
      ageIdx: entry.ageIdx,
      unitIdx: entry.unitIdx,
      duration: entry.duration,
      remaining: Math.max(0, entry.remaining),
      ready: entry.remaining <= 0,
    }));
  }

  override getSnapshot(): ProductionHudSnapshot {
    return {
      ...super.getSnapshot(),
      productionQueue: this.getProductionQueue('player'),
      productionQueueCapacity: UNIT_QUEUE_CAP,
    };
  }

  override runAI(side: Side, difficulty: DifficultyDef) {
    if (this.productionQueues[side].length >= UNIT_QUEUE_CAP) return;
    super.runAI(side, difficulty);
  }

  override update(dt: number) {
    if (this.over) {
      this.clearProductionQueues();
      return;
    }
    if (this.paused) return;

    super.update(dt);
    if (this.over) {
      this.clearProductionQueues();
      return;
    }

    this.updateProduction(dt);
  }

  private clearProductionQueues() {
    this.productionQueues.player.length = 0;
    this.productionQueues.enemy.length = 0;
  }

  private livingUnitCount(side: Side): number {
    return this.units.reduce(
      (count, unit) => count + (unit.side === side && unit.dieT === 0 ? 1 : 0),
      0,
    );
  }

  private updateProduction(dt: number) {
    for (const side of ['player', 'enemy'] as Side[]) {
      const queue = this.productionQueues[side];
      const active = queue[0];
      if (!active) continue;

      active.remaining = Math.max(0, active.remaining - dt);
      if (active.remaining > 0) continue;
      if (this.livingUnitCount(side) >= LIVING_UNIT_CAP) continue;

      this.spawnQueuedUnit(side, active.def);
      queue.shift();
    }
  }

  private spawnQueuedUnit(side: Side, def: UnitDef) {
    this.units.push({
      uid: this.productionUidCounter++,
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
}
