# Unit Production Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a host-authoritative, side-specific FIFO unit production queue with 20 queued units, 50 living units, category-based training times, cancellation/refunds, and a compact HUD queue strip.

**Architecture:** Queue state and timers live inside `GameEngine`, so solo play, AI, and the multiplayer host share one source of truth. `HudSnapshot` exposes immutable queue view models to React, while the compact multiplayer snapshot serializes queue identity and remaining time for the mirrored guest view. Unit purchases enqueue immutable purchase-time definitions; a private engine helper performs the eventual physical spawn without charging twice.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Canvas 2D, Supabase Realtime, Vitest.

## Global Constraints

- Each side has exactly one FIFO production queue.
- Queue capacity is exactly 20 entries per side.
- Living-unit capacity is exactly 50 units per side.
- Unit slot `0` trains in `1.5` seconds, slot `1` in `2.5` seconds, and slot `2` in `4.0` seconds.
- Gold is deducted immediately after a valid queue entry is created.
- Waiting entries may be cancelled for a full refund; queue index `0` is active and cannot be cancelled.
- A completed entry remains at `0` seconds and displays `READY` while 50 living units occupy the side.
- Queued units retain their purchase-time age, definition, cost, and duration after evolution.
- AI and human players use the same queue APIs and timing rules.
- Multiplayer remains host-authoritative; guest clients send actions and render mirrored queue snapshots.
- Turrets remain immediate purchases and do not enter the unit queue.
- Solo pause freezes production because `GameEngine.update()` returns before queue processing.
- Do not carry excess `dt` from one completed entry into the next queue entry.
- Use immutable copied queue view models in `HudSnapshot`; never expose mutable engine queue entries to React.

---

## File Structure

- Modify `package.json` and generated `package-lock.json`: add the Vitest test command and development dependency.
- Modify `src/game/types.ts`: define authoritative production entries and immutable HUD queue entries.
- Modify `src/game/data.ts`: define queue/living caps and the three exact training durations.
- Modify `src/game/engine.ts`: own both queues, validate purchases, process timers, spawn completed entries, cancel waiting entries, expose queue snapshots, and adapt AI decisions.
- Create `src/game/engine.test.ts`: deterministic tests for timing, FIFO behavior, payment, cancellation, caps, evolution, pause, match end, and AI.
- Modify `src/mp/session.ts`: add the `cancelUnit` multiplayer action.
- Modify `src/mp/sync.ts`: pack/unpack both queues, fix purchase-time unit-definition encoding, mirror guest queues, and host-validate cancellation.
- Create `src/mp/sync.test.ts`: protocol, mirroring, old-age unit encoding, and host-action tests.
- Modify `src/components/Game.tsx`: route queue-cancellation actions by game mode.
- Modify `src/components/HUD.tsx`: render the approved compact queue strip and display training times in unit buttons.
- Create `src/components/HUD.test.tsx`: server-rendered markup tests for queue ordering, active/ready state, cancellation affordance, count, capacity disabling, and training-time labels.
- Modify `README.md`: document the production queue in features and controls.

---

### Task 1: Add the test harness and production contracts

**Files:**
- Modify: `package.json:9-14`
- Modify: `package-lock.json`
- Modify: `src/game/types.ts:15-32`
- Modify: `src/game/data.ts:5-18`
- Create: `src/game/engine.test.ts`

**Interfaces:**
- Consumes: existing `UnitDef`, `Side`, and the three-unit-per-age ordering in `AGES`.
- Produces:
  - `ProductionEntry`
  - `ProductionQueueViewEntry`
  - `UNIT_QUEUE_CAP`
  - `LIVING_UNIT_CAP`
  - `UNIT_TRAINING_TIMES`
  - `unitTrainingTime(unitIdx: number): number`

- [ ] **Step 1: Install Vitest and add a one-shot test script**

Run:

```bash
npm install --save-dev vitest
npm pkg set scripts.test="vitest run"
```

Expected changes:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "preview": "vite preview"
  }
}
```

Expected: `package.json` and `package-lock.json` include Vitest, and `npm test -- --help` exits successfully.

- [ ] **Step 2: Write the failing production-contract tests**

Create `src/game/engine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  LIVING_UNIT_CAP,
  UNIT_QUEUE_CAP,
  UNIT_TRAINING_TIMES,
  unitTrainingTime,
} from './data';

describe('unit production contracts', () => {
  it('uses the approved queue and living-unit capacities', () => {
    expect(UNIT_QUEUE_CAP).toBe(20);
    expect(LIVING_UNIT_CAP).toBe(50);
  });

  it.each([
    [0, 1.5],
    [1, 2.5],
    [2, 4.0],
  ])('maps unit slot %i to %f seconds', (unitIdx, seconds) => {
    expect(UNIT_TRAINING_TIMES[unitIdx]).toBe(seconds);
    expect(unitTrainingTime(unitIdx)).toBe(seconds);
  });

  it('rejects an invalid unit slot instead of inventing a duration', () => {
    expect(() => unitTrainingTime(3)).toThrow('Invalid unit slot: 3');
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
npm test -- src/game/engine.test.ts
```

Expected: FAIL because `UNIT_QUEUE_CAP`, `LIVING_UNIT_CAP`, `UNIT_TRAINING_TIMES`, and `unitTrainingTime` are not exported.

- [ ] **Step 4: Add production entry types**

Append these interfaces immediately after `UnitDef` in `src/game/types.ts`:

```ts
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
```

- [ ] **Step 5: Add exact production constants and validation**

Add these exports near the other top-level game constants in `src/game/data.ts`:

```ts
export const UNIT_QUEUE_CAP = 20;
export const LIVING_UNIT_CAP = 50;
export const UNIT_TRAINING_TIMES = [1.5, 2.5, 4.0] as const;

export function unitTrainingTime(unitIdx: number): number {
  const duration = UNIT_TRAINING_TIMES[unitIdx];
  if (duration === undefined) throw new Error(`Invalid unit slot: ${unitIdx}`);
  return duration;
}
```

- [ ] **Step 6: Run focused and repository checks**

Run:

```bash
npm test -- src/game/engine.test.ts
npm run lint
npm run build
```

Expected: all three commands PASS.

- [ ] **Step 7: Commit the production contracts**

```bash
git add package.json package-lock.json src/game/types.ts src/game/data.ts src/game/engine.test.ts
git commit -m "test: add unit production contracts"
```

---

### Task 2: Implement FIFO enqueueing and timed spawning

**Files:**
- Modify: `src/game/engine.ts:3-12,34-52,62-100,129-159,196-216,220-254`
- Modify: `src/game/engine.test.ts`

**Interfaces:**
- Consumes:
  - `ProductionEntry`
  - `ProductionQueueViewEntry`
  - `UNIT_QUEUE_CAP`
  - `LIVING_UNIT_CAP`
  - `unitTrainingTime(unitIdx)`
- Produces:
  - `GameEngine.productionQueues: Record<Side, ProductionEntry[]>`
  - `GameEngine.getProductionQueue(side: Side): ProductionQueueViewEntry[]`
  - `GameEngine.buyUnit(side: Side, idx: number): boolean` with enqueue semantics
  - private `livingUnitCount(side: Side): number`
  - private `spawnUnit(side: Side, def: UnitDef): void`
  - private `updateProduction(dt: number): void`
  - `HudSnapshot.productionQueue`
  - `HudSnapshot.productionQueueCapacity`

- [ ] **Step 1: Add failing tests for payment, delayed spawn, FIFO order, and duplicates**

Extend `src/game/engine.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { AGES, UNIT_QUEUE_CAP } from './data';
import { GameEngine } from './engine';

describe('GameEngine production queue', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(1);
    engine.aiEnabled = false;
    engine.gold.player = 10_000;
  });

  it('deducts gold immediately and delays the physical spawn', () => {
    const def = AGES[0].units[0];
    const before = engine.gold.player;

    expect(engine.buyUnit('player', 0)).toBe(true);

    expect(engine.gold.player).toBe(before - def.cost);
    expect(engine.productionQueues.player).toHaveLength(1);
    expect(engine.units).toHaveLength(0);

    engine.update(1.49);
    expect(engine.units).toHaveLength(0);
    expect(engine.productionQueues.player[0].remaining).toBeCloseTo(0.01, 5);

    engine.update(0.02);
    expect(engine.units).toHaveLength(1);
    expect(engine.units[0].def).toBe(def);
    expect(engine.productionQueues.player).toHaveLength(0);
  });

  it('processes mixed and duplicate units in FIFO order', () => {
    const melee = AGES[0].units[0];
    const ranged = AGES[0].units[1];

    engine.buyUnit('player', 0);
    engine.buyUnit('player', 1);
    engine.buyUnit('player', 0);

    engine.update(1.5);
    expect(engine.units.map((unit) => unit.def)).toEqual([melee]);

    engine.update(2.5);
    expect(engine.units.map((unit) => unit.def)).toEqual([melee, ranged]);

    engine.update(1.5);
    expect(engine.units.map((unit) => unit.def)).toEqual([melee, ranged, melee]);
  });

  it('does not carry excess frame time into the next entry', () => {
    engine.buyUnit('player', 0);
    engine.buyUnit('player', 1);

    engine.update(5);

    expect(engine.units).toHaveLength(1);
    expect(engine.productionQueues.player).toHaveLength(1);
    expect(engine.productionQueues.player[0].remaining).toBe(2.5);
  });

  it('returns copied queue view models in the HUD snapshot', () => {
    engine.buyUnit('player', 2);

    const snapshot = engine.getSnapshot();

    expect(snapshot.productionQueue).toEqual([
      {
        ageIdx: 0,
        unitIdx: 2,
        duration: 4,
        remaining: 4,
        ready: false,
      },
    ]);
    expect(snapshot.productionQueueCapacity).toBe(UNIT_QUEUE_CAP);
    expect(snapshot.productionQueue).not.toBe(engine.productionQueues.player);
  });
});
```

Keep the Task 1 contract tests in the same file; merge imports rather than creating duplicate import statements.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
npm test -- src/game/engine.test.ts
```

Expected: FAIL because `productionQueues`, queue snapshot fields, and timed production do not exist, and `buyUnit()` still spawns immediately.

- [ ] **Step 3: Extend imports and `HudSnapshot`**

Change the `src/game/engine.ts` imports to include the production constants and types:

```ts
import {
  AGES, DIFFICULTIES, FIELD_W, GROUND_Y, PLAYER_BASE_X, ENEMY_BASE_X,
  TURRET_SLOTS, START_BASE_HP, EVOLVE_HP_BONUS, START_GOLD, EVOLVE_COSTS,
  PASSIVE_GOLD, PASSIVE_XP, LIVING_UNIT_CAP, UNIT_QUEUE_CAP,
  unitTrainingTime, other,
} from './data';
import type {
  Side, UnitEnt, ProjectileEnt, TurretEnt, ParticleEnt, FloatText,
  StrikeFx, UnitDef, ProjectileKind, DifficultyDef, ProductionEntry,
  ProductionQueueViewEntry,
} from './types';
```

Extend `HudSnapshot`:

```ts
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
  productionQueue: ProductionQueueViewEntry[];
  productionQueueCapacity: number;
}
```

- [ ] **Step 4: Add authoritative queue state and immutable queue views**

Add this field beside the other public engine state:

```ts
productionQueues: Record<Side, ProductionEntry[]> = {
  player: [],
  enemy: [],
};
```

Add this public method before `getSnapshot()`:

```ts
getProductionQueue(side: Side): ProductionQueueViewEntry[] {
  return this.productionQueues[side].map((entry) => ({
    ageIdx: entry.ageIdx,
    unitIdx: entry.unitIdx,
    duration: entry.duration,
    remaining: Math.max(0, entry.remaining),
    ready: entry.remaining <= 0,
  }));
}
```

Add these fields to the object returned by `getSnapshot()`:

```ts
productionQueue: this.getProductionQueue('player'),
productionQueueCapacity: UNIT_QUEUE_CAP,
```

- [ ] **Step 5: Replace immediate spawning with enqueueing**

Replace `buyUnit()` with:

```ts
buyUnit(side: Side, idx: number): boolean {
  if (this.over) return false;

  const def = this.age(side).units[idx];
  const queue = this.productionQueues[side];
  if (!def || queue.length >= UNIT_QUEUE_CAP || this.gold[side] < def.cost) {
    if (side === 'player') this.events.push('deny');
    return false;
  }

  const duration = unitTrainingTime(idx);
  this.gold[side] -= def.cost;
  queue.push({
    def,
    ageIdx: this.ageIdx[side],
    unitIdx: idx,
    cost: def.cost,
    duration,
    remaining: duration,
  });

  if (side === 'player') this.events.push('buy');
  return true;
}
```

Add these private helpers immediately after `buyUnit()`:

```ts
private livingUnitCount(side: Side): number {
  return this.units.reduce(
    (count, unit) => count + (unit.side === side && unit.dieT === 0 ? 1 : 0),
    0,
  );
}

private spawnUnit(side: Side, def: UnitDef) {
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
}

private updateProduction(dt: number) {
  for (const side of ['player', 'enemy'] as Side[]) {
    const queue = this.productionQueues[side];
    const active = queue[0];
    if (!active) continue;

    active.remaining = Math.max(0, active.remaining - dt);
    if (active.remaining > 0) continue;
    if (this.livingUnitCount(side) >= LIVING_UNIT_CAP) continue;

    this.spawnUnit(side, active.def);
    queue.shift();
  }
}
```

Call production exactly once in `update(dt)`, after AI decisions and before unit movement:

```ts
if (this.aiEnabled && this.aiT >= 0.35) {
  this.runAI('enemy', DIFFICULTIES[this.difficultyIdx]);
  this.aiT = 0;
}

this.updateProduction(dt);
this.updateUnits(dt);
this.updateProjectiles(dt);
this.updateTurrets(dt);
this.updateSpecials(dt);
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npm test -- src/game/engine.test.ts
```

Expected: all production-contract and FIFO queue tests PASS.

- [ ] **Step 7: Run static checks**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit the core queue**

```bash
git add src/game/engine.ts src/game/engine.test.ts
git commit -m "feat: add timed unit production queue"
```

---

### Task 3: Add cancellation, caps, evolution stability, pause behavior, match lifecycle, and AI integration

**Files:**
- Modify: `src/game/engine.ts:114-159,220-254,560-700`
- Modify: `src/game/engine.test.ts`

**Interfaces:**
- Consumes:
  - `GameEngine.productionQueues`
  - `UNIT_QUEUE_CAP`
  - `LIVING_UNIT_CAP`
- Produces:
  - `GameEngine.cancelQueuedUnit(side: Side, queueIndex: number): boolean`
  - AI committed-army calculation using living plus queued units
  - queue clearing when a base is destroyed

- [ ] **Step 1: Add deterministic helpers and failing rule tests**

Add these imports to `src/game/engine.test.ts`:

```ts
import { vi } from 'vitest';
import {
  AGES,
  DIFFICULTIES,
  EVOLVE_COSTS,
  LIVING_UNIT_CAP,
  UNIT_QUEUE_CAP,
} from './data';
import type { Side, UnitEnt } from './types';
```

Use one consolidated Vitest import:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
```

Add this test helper below imports:

```ts
function makeLivingUnit(side: Side, uid: number): UnitEnt {
  const def = AGES[0].units[0];
  return {
    uid,
    side,
    def,
    x: side === 'player' ? 120 : 1480,
    yOff: 0,
    hp: def.hp,
    maxHp: def.hp,
    cooldown: 1,
    attackAnim: 0,
    walkT: 0,
    flash: 0,
    dieT: 0,
    speedJit: 1,
  };
}
```

Add these tests inside `describe('GameEngine production queue', ...)`:

```ts
it('rejects the 21st queued unit without deducting gold', () => {
  const def = AGES[0].units[0];
  const startingGold = def.cost * (UNIT_QUEUE_CAP + 2);
  engine.gold.player = startingGold;

  for (let i = 0; i < UNIT_QUEUE_CAP; i++) {
    expect(engine.buyUnit('player', 0)).toBe(true);
  }

  const goldAtCapacity = engine.gold.player;
  expect(engine.buyUnit('player', 0)).toBe(false);
  expect(engine.productionQueues.player).toHaveLength(UNIT_QUEUE_CAP);
  expect(engine.gold.player).toBe(goldAtCapacity);
});

it('refunds a waiting entry but never cancels the active entry', () => {
  const first = AGES[0].units[0];
  const second = AGES[0].units[1];

  engine.buyUnit('player', 0);
  engine.buyUnit('player', 1);
  const paidGold = engine.gold.player;

  expect(engine.cancelQueuedUnit('player', 0)).toBe(false);
  expect(engine.gold.player).toBe(paidGold);

  expect(engine.cancelQueuedUnit('player', 1)).toBe(true);
  expect(engine.gold.player).toBe(paidGold + second.cost);
  expect(engine.productionQueues.player.map((entry) => entry.def)).toEqual([first]);

  expect(engine.cancelQueuedUnit('player', 9)).toBe(false);
});

it('keeps a completed unit ready until a living slot opens', () => {
  engine.units = Array.from(
    { length: LIVING_UNIT_CAP },
    (_, index) => makeLivingUnit('player', -(index + 1)),
  );
  engine.buyUnit('player', 0);

  engine.update(1.5);

  expect(engine.productionQueues.player[0].remaining).toBe(0);
  expect(engine.getSnapshot().productionQueue[0].ready).toBe(true);
  expect(engine.units.filter((unit) => unit.side === 'player' && unit.dieT === 0))
    .toHaveLength(LIVING_UNIT_CAP);

  engine.units[0].dieT = 0.45;
  engine.update(0.01);

  expect(engine.productionQueues.player).toHaveLength(0);
  expect(engine.units.filter((unit) => unit.side === 'player' && unit.dieT === 0))
    .toHaveLength(LIVING_UNIT_CAP);
});

it('spawns the originally purchased unit after evolution', () => {
  const stoneUnit = AGES[0].units[0];
  engine.buyUnit('player', 0);

  engine.xp.player = EVOLVE_COSTS[0];
  expect(engine.evolve('player')).toBe(true);
  expect(engine.ageIdx.player).toBe(1);

  engine.update(1.5);

  expect(engine.units[0].def).toBe(stoneUnit);
  expect(engine.units[0].def).not.toBe(AGES[1].units[0]);
});

it('freezes the production timer while paused', () => {
  engine.buyUnit('player', 1);
  engine.paused = true;

  engine.update(10);

  expect(engine.productionQueues.player[0].remaining).toBe(2.5);
  expect(engine.units).toHaveLength(0);
});

it('rejects purchases and cancellation after match end', () => {
  engine.buyUnit('player', 0);
  engine.buyUnit('player', 1);
  engine.over = true;

  const gold = engine.gold.player;
  expect(engine.buyUnit('player', 0)).toBe(false);
  expect(engine.cancelQueuedUnit('player', 1)).toBe(false);
  expect(engine.gold.player).toBe(gold);
});

it('clears both queues when base destruction ends the match', () => {
  engine.buyUnit('player', 0);
  engine.gold.enemy = 10_000;
  engine.buyUnit('enemy', 1);

  const internals = engine as unknown as {
    damageBase(side: Side, damage: number): void;
  };
  internals.damageBase('enemy', 1_000_000);

  expect(engine.over).toBe(true);
  expect(engine.winner).toBe('player');
  expect(engine.productionQueues.player).toHaveLength(0);
  expect(engine.productionQueues.enemy).toHaveLength(0);
});

it('routes AI unit purchases through the production queue', () => {
  engine.gold.enemy = 10_000;
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);

  engine.runAI('enemy', DIFFICULTIES[3]);

  expect(engine.productionQueues.enemy.length).toBeGreaterThan(0);
  expect(engine.units.filter((unit) => unit.side === 'enemy')).toHaveLength(0);
  random.mockRestore();
});

it('does not let AI exceed the queue capacity', () => {
  engine.gold.enemy = 1_000_000;
  for (let i = 0; i < UNIT_QUEUE_CAP; i++) {
    expect(engine.buyUnit('enemy', 0)).toBe(true);
  }
  const goldAtCapacity = engine.gold.enemy;
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);

  engine.runAI('enemy', DIFFICULTIES[3]);

  expect(engine.productionQueues.enemy).toHaveLength(UNIT_QUEUE_CAP);
  expect(engine.gold.enemy).toBe(goldAtCapacity);
  random.mockRestore();
});
```

- [ ] **Step 2: Run the tests and verify the new cases fail**

Run:

```bash
npm test -- src/game/engine.test.ts
```

Expected: FAIL because cancellation is missing and the living-cap/AI behavior is incomplete.

- [ ] **Step 3: Implement cancellation with exact refunds**

Add this public method after `buyUnit()`:

```ts
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
```

- [ ] **Step 4: Make AI count committed units and stop unit decisions at queue capacity**

Inside `runAI()`, replace:

```ts
const myUnits = this.units.filter((u) => u.side === side && u.dieT === 0);
const enemyCount = myUnits.length;
```

with:

```ts
const myUnits = this.units.filter((u) => u.side === side && u.dieT === 0);
const committedCount = myUnits.length + this.productionQueues[side].length;
const enemyCount = myUnits.length;
```

After the turret decision block and before emergency-defense unit logic, add:

```ts
if (this.productionQueues[side].length >= UNIT_QUEUE_CAP) return;
```

Replace the regular-army comparison:

```ts
if (enemyCount < desired && Math.random() < diff.aggro) {
```

with:

```ts
if (committedCount < desired && Math.random() < diff.aggro) {
```

Keep `enemyCount` for ranged ratios and battlefield composition because those calculations intentionally describe currently living units.

- [ ] **Step 5: Clear queues when a base destruction ends the match**

In `damageBase()`, immediately after setting `over` and `winner`, add:

```ts
this.productionQueues.player.length = 0;
this.productionQueues.enemy.length = 0;
```

The resulting match-end block begins:

```ts
if (this.baseHp[side] <= 0) {
  this.baseHp[side] = 0;
  this.over = true;
  this.winner = other(side);
  this.productionQueues.player.length = 0;
  this.productionQueues.enemy.length = 0;
  this.shake = 1;
  // existing destruction particles and sound remain unchanged
}
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- src/game/engine.test.ts
```

Expected: all engine queue tests PASS.

- [ ] **Step 7: Run full static checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit queue rules and AI integration**

```bash
git add src/game/engine.ts src/game/engine.test.ts
git commit -m "feat: enforce production queue rules"
```

---

### Task 4: Synchronize queues and cancellation through multiplayer

**Files:**
- Modify: `src/mp/session.ts:8-13`
- Modify: `src/mp/sync.ts:3-37,39-77,81-113,127-165,165-207,315-396`
- Create: `src/mp/sync.test.ts`

**Interfaces:**
- Consumes:
  - `ProductionQueueViewEntry`
  - `GameEngine.productionQueues`
  - `GameEngine.cancelQueuedUnit(side, queueIndex)`
  - `unitTrainingTime(unitIdx)`
- Produces:
  - `MpAction.type` includes `'cancelUnit'`
  - exported `PackedSnap`
  - exported `buildSnapshot(engine: GameEngine): PackedSnap`
  - packed queue tuple at index `14`
  - `GuestSync.productionQueues: Record<Side, ProductionQueueViewEntry[]>`

- [ ] **Step 1: Write failing multiplayer protocol tests**

Create `src/mp/sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AGES, EVOLVE_COSTS } from '../game/data';
import { GameEngine } from '../game/engine';
import type { Session } from './session';
import { buildSnapshot, GuestSync, HostSync } from './sync';

type MockSession = Session & {
  onMessage: ((event: string, payload: unknown) => void) | null;
  send: ReturnType<typeof vi.fn>;
};

function makeSession(): MockSession {
  return {
    onMessage: null,
    onPeerLeave: null,
    send: vi.fn(),
  } as unknown as MockSession;
}

describe('multiplayer production queues', () => {
  it('packs both queues with purchase-time unit identity and remaining time', () => {
    const engine = new GameEngine(1);
    engine.aiEnabled = false;
    engine.gold.player = 10_000;
    engine.gold.enemy = 10_000;

    engine.buyUnit('player', 0);
    engine.buyUnit('enemy', 2);
    engine.update(0.5);

    const snapshot = buildSnapshot(engine);

    expect(snapshot[14]).toEqual([
      [[0, 10]],
      [[2, 35]],
    ]);
  });

  it('preserves an old-age spawned unit code after evolution', () => {
    const engine = new GameEngine(1);
    engine.aiEnabled = false;
    engine.gold.player = 10_000;
    engine.buyUnit('player', 0);
    engine.update(1.5);

    engine.xp.player = EVOLVE_COSTS[0];
    engine.evolve('player');

    const snapshot = buildSnapshot(engine);

    expect(snapshot[7][0][2]).toBe(0);
    expect(engine.units[0].def).toBe(AGES[0].units[0]);
  });

  it('mirrors the host enemy queue into the guest player HUD', () => {
    const hostEngine = new GameEngine(1);
    hostEngine.aiEnabled = false;
    hostEngine.gold.enemy = 10_000;
    hostEngine.buyUnit('enemy', 1);
    hostEngine.update(0.5);

    const session = makeSession();
    const guest = new GuestSync(session);
    session.onMessage?.('state', buildSnapshot(hostEngine));

    expect(guest.getSnapshot().productionQueue).toEqual([
      {
        ageIdx: 0,
        unitIdx: 1,
        duration: 2.5,
        remaining: 2,
        ready: false,
      },
    ]);
  });

  it('host-validates guest cancellation against the enemy-side queue', () => {
    const engine = new GameEngine(1);
    engine.gold.enemy = 10_000;
    engine.buyUnit('enemy', 0);
    engine.buyUnit('enemy', 1);
    const expectedRefund = AGES[0].units[1].cost;
    const goldAfterPurchases = engine.gold.enemy;

    const session = makeSession();
    new HostSync(engine, session);
    session.onMessage?.('action', { type: 'cancelUnit', idx: 1 });

    expect(engine.productionQueues.enemy).toHaveLength(1);
    expect(engine.gold.enemy).toBe(goldAfterPurchases + expectedRefund);
  });

  it('does not allow a guest to cancel the active queue entry', () => {
    const engine = new GameEngine(1);
    engine.gold.enemy = 10_000;
    engine.buyUnit('enemy', 0);
    const goldAfterPurchase = engine.gold.enemy;

    const session = makeSession();
    new HostSync(engine, session);
    session.onMessage?.('action', { type: 'cancelUnit', idx: 0 });

    expect(engine.productionQueues.enemy).toHaveLength(1);
    expect(engine.gold.enemy).toBe(goldAfterPurchase);
  });
});
```

- [ ] **Step 2: Run the protocol tests and verify they fail**

Run:

```bash
npm test -- src/mp/sync.test.ts
```

Expected: FAIL because snapshot builders are not exported, tuple index `14` does not exist, queues are not mirrored, and `cancelUnit` is not handled.

- [ ] **Step 3: Add the cancellation action**

Change `MpAction` in `src/mp/session.ts` to:

```ts
export interface MpAction {
  type: 'buyUnit' | 'buyTurret' | 'evolve' | 'special' | 'cancelUnit';
  idx?: number;
}
```

- [ ] **Step 4: Add stable unit-definition encoding and queue packing**

Update the `src/mp/sync.ts` imports:

```ts
import {
  AGES, FIELD_W, GROUND_Y, EVOLVE_COSTS, UNIT_QUEUE_CAP, unitTrainingTime,
} from '../game/data';
import type {
  Side, UnitEnt, ProjectileEnt, TurretEnt, ParticleEnt, FloatText, StrikeFx,
  ProjectileKind, ProductionQueueViewEntry, UnitDef,
} from '../game/types';
```

Add this helper after the protocol constants:

```ts
function unitDefCode(def: UnitDef): number {
  for (let ageIdx = 0; ageIdx < AGES.length; ageIdx++) {
    const unitIdx = AGES[ageIdx].units.indexOf(def);
    if (unitIdx >= 0) return ageIdx * 10 + unitIdx;
  }
  throw new Error(`Unknown unit definition: ${def.id}`);
}
```

Export and extend `PackedSnap`:

```ts
export type PackedSnap = [
  number,
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  number[][],
  number[][],
  (number | null)[][],
  number[][],
  [number, number],
  number,
  number,
  [number[][], number[][]], // 14 queues, entries [defCode, remainingTenths]
];
```

Change unit packing from the current-age lookup to:

```ts
const units: number[][] = e.units.map((u) => [
  u.uid,
  u.side === 'player' ? 0 : 1,
  unitDefCode(u.def),
  Math.round(u.x),
  Math.round(u.hp),
  Math.round(u.dieT * 10),
  Math.round(u.attackAnim * 100),
]);
```

Add queue packing inside `buildSnapshot()`:

```ts
const queues = (['player', 'enemy'] as Side[]).map((side) =>
  e.productionQueues[side].map((entry) => [
    entry.ageIdx * 10 + entry.unitIdx,
    Math.round(Math.max(0, entry.remaining) * 10),
  ]),
) as [number[][], number[][]];
```

Export `buildSnapshot` and append `queues` to its return value:

```ts
export function buildSnapshot(e: GameEngine): PackedSnap {
  // existing unit, projectile, turret, strike, and queue packing
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
```

- [ ] **Step 5: Host-validate cancellation**

Add this switch case in `HostSync.applyAction()`:

```ts
case 'cancelUnit': e.cancelQueuedUnit('enemy', a.idx ?? -1); break;
```

The complete switch becomes:

```ts
switch (a.type) {
  case 'buyUnit': e.buyUnit('enemy', a.idx ?? 0); break;
  case 'buyTurret': e.buyTurret('enemy', a.idx ?? 0); break;
  case 'evolve': e.evolve('enemy'); break;
  case 'special': e.useSpecial('enemy'); break;
  case 'cancelUnit': e.cancelQueuedUnit('enemy', a.idx ?? -1); break;
}
```

- [ ] **Step 6: Unpack and mirror guest queues**

Add this helper before `GuestSync`:

```ts
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
```

Add this public state to `GuestSync`:

```ts
productionQueues: Record<Side, ProductionQueueViewEntry[]> = {
  player: [],
  enemy: [],
};
```

At the end of `applySnapshot()`, before game-over handling, mirror host queues:

```ts
this.productionQueues = {
  player: unpackQueue(s[14][1]),
  enemy: unpackQueue(s[14][0]),
};
```

Interpolate only the active display timer in `GuestSync.update(dt)`:

```ts
const activeQueueEntry = this.productionQueues.player[0];
if (activeQueueEntry && activeQueueEntry.remaining > 0) {
  activeQueueEntry.remaining = Math.max(0, activeQueueEntry.remaining - dt);
  activeQueueEntry.ready = activeQueueEntry.remaining <= 0;
}
```

Add these fields to `GuestSync.getSnapshot()`:

```ts
productionQueue: this.productionQueues.player.map((entry) => ({ ...entry })),
productionQueueCapacity: UNIT_QUEUE_CAP,
```

- [ ] **Step 7: Run multiplayer and engine tests**

Run:

```bash
npm test -- src/mp/sync.test.ts src/game/engine.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run repository checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit multiplayer queue synchronization**

```bash
git add src/mp/session.ts src/mp/sync.ts src/mp/sync.test.ts
git commit -m "feat: sync production queues online"
```

---

### Task 5: Add the compact HUD queue strip and cancellation wiring

**Files:**
- Modify: `src/components/Game.tsx:271-287,395-406`
- Modify: `src/components/HUD.tsx:3-17,33-39,84-180`
- Create: `src/components/HUD.test.tsx`

**Interfaces:**
- Consumes:
  - `HudSnapshot.productionQueue`
  - `HudSnapshot.productionQueueCapacity`
  - `UNIT_TRAINING_TIMES`
  - multiplayer action `{ type: 'cancelUnit'; idx: number }`
- Produces:
  - `HUD` prop `onCancelQueuedUnit(index: number): void`
  - visible FIFO queue strip
  - active progress/remaining time or `READY`
  - cancellable waiting entries
  - queue-capacity unit-button disabling
  - training-time labels on unit buttons

- [ ] **Step 1: Write failing server-rendered HUD tests**

Create `src/components/HUD.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HudSnapshot } from '../game/engine';
import HUD from './HUD';

function snapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    gold: 10_000,
    xp: 0,
    ageIdx: 0,
    baseHp: 700,
    baseMax: 700,
    enemyBaseHp: 700,
    enemyBaseMax: 700,
    enemyAgeIdx: 0,
    specialCd: 0,
    specialMax: 45,
    canEvolve: false,
    evolveCost: 210,
    over: false,
    winner: null,
    kills: 0,
    time: 0,
    turretsUsed: 0,
    productionQueue: [],
    productionQueueCapacity: 20,
    ...overrides,
  };
}

function renderHud(snap: HudSnapshot) {
  return renderToStaticMarkup(
    <HUD
      snap={snap}
      paused={false}
      muted={false}
      isMp={false}
      onBuyUnit={vi.fn()}
      onBuyTurret={vi.fn()}
      onEvolve={vi.fn()}
      onSpecial={vi.fn()}
      onPause={vi.fn()}
      onMute={vi.fn()}
      onCancelQueuedUnit={vi.fn()}
    />,
  );
}

describe('HUD production queue', () => {
  it('shows FIFO entries, active time, cancellation affordance, and count', () => {
    const html = renderHud(snapshot({
      productionQueue: [
        { ageIdx: 0, unitIdx: 0, duration: 1.5, remaining: 0.8, ready: false },
        { ageIdx: 0, unitIdx: 1, duration: 2.5, remaining: 2.5, ready: false },
      ],
    }));

    expect(html).toContain('QUEUE');
    expect(html).toContain('2 / 20');
    expect(html).toContain('Training Clubman');
    expect(html).toContain('0.8s');
    expect(html).toContain('Cancel queued Slingshot');
  });

  it('shows READY for a completed unit blocked by the living cap', () => {
    const html = renderHud(snapshot({
      productionQueue: [
        { ageIdx: 0, unitIdx: 2, duration: 4, remaining: 0, ready: true },
      ],
    }));

    expect(html).toContain('Training Dino Rider');
    expect(html).toContain('READY');
  });

  it('shows all three approved training durations', () => {
    const html = renderHud(snapshot());

    expect(html).toContain('1.5s');
    expect(html).toContain('2.5s');
    expect(html).toContain('4.0s');
  });

  it('disables unit purchases when the queue is full', () => {
    const productionQueue = Array.from({ length: 20 }, (_, index) => ({
      ageIdx: 0,
      unitIdx: index % 3,
      duration: [1.5, 2.5, 4][index % 3],
      remaining: [1.5, 2.5, 4][index % 3],
      ready: false,
    }));
    const html = renderHud(snapshot({ productionQueue }));

    expect(html.match(/aria-label="Queue Clubman"/g)).toHaveLength(1);
    expect(html).toMatch(/<button(?=[^>]*aria-label="Queue Clubman")(?=[^>]*disabled="")[^>]*>/);
  });
});
```

- [ ] **Step 2: Run the HUD tests and verify they fail**

Run:

```bash
npm test -- src/components/HUD.test.tsx
```

Expected: FAIL because the cancellation prop and queue markup do not exist.

- [ ] **Step 3: Route cancellation in `Game.tsx`**

Add this action beside the other player actions:

```ts
const actCancelQueuedUnit = (queueIndex: number) => {
  if (mode === 'guest') {
    guestRef.current!.sendAction({ type: 'cancelUnit', idx: queueIndex });
    playSfx('click');
  } else {
    engineRef.current!.cancelQueuedUnit('player', queueIndex);
  }
};
```

Pass it to the HUD:

```tsx
<HUD
  snap={hud}
  paused={paused}
  muted={muted}
  isMp={isMp}
  onBuyUnit={actBuyUnit}
  onBuyTurret={actBuyTurret}
  onEvolve={actEvolve}
  onSpecial={actSpecial}
  onPause={togglePause}
  onMute={toggleMute}
  onCancelQueuedUnit={actCancelQueuedUnit}
/>
```

- [ ] **Step 4: Extend HUD imports, props, and queue state**

Change the HUD imports to:

```ts
import { AGES, TURRET_SLOTS, unitTrainingTime } from '../game/data';
import type { HudSnapshot } from '../game/engine';
```

Add the prop:

```ts
onCancelQueuedUnit: (queueIndex: number) => void;
```

Destructure it in the component signature:

```ts
export default function HUD({
  snap,
  paused,
  muted,
  isMp,
  onBuyUnit,
  onBuyTurret,
  onEvolve,
  onSpecial,
  onPause,
  onMute,
  onCancelQueuedUnit,
}: Props) {
```

Add:

```ts
const queueFull = snap.productionQueue.length >= snap.productionQueueCapacity;
```

- [ ] **Step 5: Render the approved compact queue strip**

Insert this block between the top bar and the existing bottom bar:

```tsx
<div className="flex items-center gap-2 px-2 pt-1.5 sm:px-3">
  <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-amber-300">
    Queue
  </span>

  <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
    {snap.productionQueue.length === 0 && (
      <div className="flex h-11 items-center text-[11px] font-medium text-stone-500">
        Select a unit to begin training
      </div>
    )}

    {snap.productionQueue.map((entry, queueIndex) => {
      const def = AGES[entry.ageIdx]?.units[entry.unitIdx];
      if (!def) return null;

      const active = queueIndex === 0;
      const progress = entry.duration > 0
        ? Math.max(0, Math.min(1, 1 - entry.remaining / entry.duration))
        : 1;

      return (
        <button
          key={`${entry.ageIdx}-${entry.unitIdx}-${queueIndex}`}
          type="button"
          disabled={active}
          onClick={() => onCancelQueuedUnit(queueIndex)}
          aria-label={active ? `Training ${def.name}` : `Cancel queued ${def.name}`}
          title={active ? `${def.name} is training` : `Cancel ${def.name} and refund ${def.cost} gold`}
          className={`relative flex h-11 w-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg ring-1 ${
            active
              ? 'cursor-default bg-stone-800 ring-amber-400/70'
              : 'bg-stone-900 ring-white/15 active:scale-90'
          }`}
        >
          {active && (
            <div
              className="absolute inset-x-0 bottom-0 bg-amber-500/35"
              style={{ height: `${progress * 100}%` }}
            />
          )}
          <span className="relative text-lg leading-none">{def.icon}</span>
          <span className={`relative text-[9px] font-black ${entry.ready ? 'text-green-300' : 'text-stone-200'}`}>
            {active
              ? entry.ready
                ? 'READY'
                : `${entry.remaining.toFixed(1)}s`
              : '✕'}
          </span>
        </button>
      );
    })}
  </div>

  <span className={`shrink-0 text-[10px] font-black tabular-nums ${queueFull ? 'text-red-300' : 'text-stone-400'}`}>
    {snap.productionQueue.length} / {snap.productionQueueCapacity}
  </span>
</div>
```

- [ ] **Step 6: Disable full-queue purchases and show training durations**

Inside `age.units.map`, change affordability to:

```ts
const afford = snap.gold >= u.cost && !queueFull && !snap.over;
```

Add an accessible label to the unit button:

```tsx
aria-label={`Queue ${u.name}`}
```

Replace the current gold-only line with:

```tsx
<span className={`text-[10px] font-bold tabular-nums ${afford ? 'text-amber-300' : 'text-stone-400'}`}>
  💰{u.cost}
</span>
<span className="text-[9px] font-bold text-stone-400">
  {unitTrainingTime(i).toFixed(1)}s
</span>
```

Keep turret affordability unchanged.

- [ ] **Step 7: Run HUD and integration tests**

Run:

```bash
npm test -- src/components/HUD.test.tsx src/game/engine.test.ts src/mp/sync.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run repository checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 9: Manually verify queue interactions in solo and online modes**

Run:

```bash
npm run dev
```

Verify in a desktop viewport:

1. Queue Clubman, Slingshot, Dino Rider, then another Clubman.
2. Confirm the count reads `4 / 20`.
3. Confirm only Clubman trains first and its overlay fills for 1.5 seconds.
4. Cancel the waiting Slingshot and confirm its cost is refunded.
5. Confirm the active entry cannot be clicked.
6. Fill the queue to 20 and confirm all unit purchase buttons disable.
7. Evolve with an old-age unit queued and confirm the old unit icon remains and spawns unchanged.

Verify in a narrow mobile viewport:

1. Confirm the queue strip scrolls horizontally without widening the page.
2. Confirm queue entries remain large enough to tap.
3. Confirm the battlefield retains usable vertical height.

Verify online with two browser tabs:

1. Host creates a room and guest joins.
2. Guest queues two units and cancels the second.
3. Confirm both tabs show the same guest queue order and refund.
4. Confirm the host determines spawn timing.

Stop the development server after verification.

- [ ] **Step 10: Commit the HUD and interaction flow**

```bash
git add src/components/Game.tsx src/components/HUD.tsx src/components/HUD.test.tsx
git commit -m "feat: add production queue HUD"
```

---

### Task 6: Document the mechanic and perform final verification

**Files:**
- Modify: `README.md:7-20,22-44`

**Interfaces:**
- Consumes: completed engine, multiplayer, and HUD behavior.
- Produces: user-facing repository documentation and a verified release-ready change set.

- [ ] **Step 1: Update the README feature list**

Add this feature bullet after the five-ages bullet:

```md
- **Timed unit production** — queue up to 20 units per side; close-range units train in 1.5s, long-range units in 2.5s, and special/heavy units in 4.0s
```

Update the AI bullet to:

```md
- **4 AI difficulties** — Easy, Normal, Hard, Insane — with a smart enemy that builds turrets, coordinates queued wave attacks, times specials and rushes emergency defense
```

- [ ] **Step 2: Add queue controls to the local-play section**

After the local run commands, add:

```md
### Unit production

Unit purchases enter a shared FIFO queue and spend gold immediately. Each side may queue up to 20 units and field up to 50 living units.

- Close-range unit: 1.5 seconds
- Long-range unit: 2.5 seconds
- Special/heavy unit: 4.0 seconds
- Tap a waiting queue entry to cancel it for a full refund
- The active training entry cannot be cancelled
- A completed entry displays `READY` when the 50-unit living cap is full and spawns when a slot opens
```

- [ ] **Step 3: Run the complete automated suite**

Run:

```bash
npm test
```

Expected: all tests PASS, including:

- `src/game/engine.test.ts`
- `src/mp/sync.test.ts`
- `src/components/HUD.test.tsx`

- [ ] **Step 4: Run lint and production build**

Run:

```bash
npm run lint
npm run build
```

Expected:

- ESLint exits with status `0`.
- TypeScript compilation succeeds.
- Vite writes the production bundle to `dist/`.

- [ ] **Step 5: Inspect the final diff for scope and accidental secrets**

Run:

```bash
git status --short
git diff --check
git diff --stat
git diff
```

Expected:

- Only the files listed in this plan are changed.
- `git diff --check` prints no whitespace errors.
- No Supabase credentials or unrelated generated files are newly introduced.
- No debug logging remains.

- [ ] **Step 6: Commit documentation and final verification**

```bash
git add README.md
git commit -m "docs: explain timed unit production"
```

- [ ] **Step 7: Confirm clean repository state**

Run:

```bash
git status --short
```

Expected: no output.

---

## Plan Self-Review

- Spec coverage: queue timing, 20-entry capacity, 50 living units, payment, FIFO, duplicate units, cancellation/refund, active lock, ready waiting, evolution stability, pause, AI, host validation, guest mirroring, HUD, mobile behavior, lifecycle, and documentation each map to a task.
- Placeholder scan: the plan contains no incomplete implementation steps.
- Type consistency:
  - `ProductionEntry` is authoritative mutable engine state.
  - `ProductionQueueViewEntry` is copied display state.
  - `HudSnapshot.productionQueue` has the same type in engine and guest implementations.
  - Multiplayer queue rows encode `[ageIdx * 10 + unitIdx, remainingTenths]`.
  - Cancellation uses authoritative FIFO queue indices in engine, host sync, game routing, and HUD.
