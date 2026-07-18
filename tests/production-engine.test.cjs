const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AGES,
  DIFFICULTIES,
  EVOLVE_COSTS,
  LIVING_UNIT_CAP,
  UNIT_QUEUE_CAP,
  UNIT_TRAINING_TIMES,
  unitTrainingTime,
} = require('../.test-dist/game/data.js');
require('../.test-dist/game/production-engine.js');
const { GameEngine } = require('../.test-dist/game/engine.js');
const { getProductionQueues, cancelQueuedUnit } = require('../.test-dist/game/production-engine.js');

function engine() {
  const e = new GameEngine(1);
  e.aiEnabled = false;
  e.gold.player = 100000;
  e.gold.enemy = 100000;
  return e;
}

function living(side, uid) {
  const def = AGES[0].units[0];
  return { uid, side, def, x: side === 'player' ? 120 : 1480, yOff: 0, hp: def.hp,
    maxHp: def.hp, cooldown: 1, attackAnim: 0, walkT: 0, flash: 0, dieT: 0, speedJit: 1 };
}

test('production constants match approved values', () => {
  assert.equal(UNIT_QUEUE_CAP, 20);
  assert.equal(LIVING_UNIT_CAP, 50);
  assert.deepEqual([...UNIT_TRAINING_TIMES], [1.5, 2.5, 4]);
  assert.equal(unitTrainingTime(0), 1.5);
  assert.equal(unitTrainingTime(1), 2.5);
  assert.equal(unitTrainingTime(2), 4);
  assert.throws(() => unitTrainingTime(3), /Invalid unit slot: 3/);
});

test('purchase pays immediately and spawn is delayed', () => {
  const e = engine();
  const def = AGES[0].units[0];
  const before = e.gold.player;
  assert.equal(e.buyUnit('player', 0), true);
  assert.equal(e.gold.player, before - def.cost);
  assert.equal(e.units.length, 0);
  assert.equal(getProductionQueues(e).player.length, 1);
  e.update(1.49);
  assert.equal(e.units.length, 0);
  assert.ok(Math.abs(getProductionQueues(e).player[0].remaining - 0.01) < 1e-9);
  e.update(0.02);
  assert.equal(e.units.length, 1);
  assert.equal(e.units[0].def, def);
});

test('FIFO order and duplicates', () => {
  const e = engine();
  const a = AGES[0].units;
  e.buyUnit('player', 0);
  e.buyUnit('player', 1);
  e.buyUnit('player', 0);
  e.update(1.5);
  assert.deepEqual(e.units.map((u) => u.def.id), [a[0].id]);
  e.update(2.5);
  assert.deepEqual(e.units.map((u) => u.def.id), [a[0].id, a[1].id]);
  e.update(1.5);
  assert.deepEqual(e.units.map((u) => u.def.id), [a[0].id, a[1].id, a[0].id]);
});

test('excess dt is not carried into next entry', () => {
  const e = engine();
  e.buyUnit('player', 0);
  e.buyUnit('player', 1);
  e.update(5);
  assert.equal(e.units.length, 1);
  assert.equal(getProductionQueues(e).player[0].remaining, 2.5);
});

test('queue capacity rejects 21st purchase without charge', () => {
  const e = engine();
  for (let i = 0; i < UNIT_QUEUE_CAP; i++) assert.equal(e.buyUnit('player', 0), true);
  const gold = e.gold.player;
  assert.equal(e.buyUnit('player', 0), false);
  assert.equal(e.gold.player, gold);
  assert.equal(getProductionQueues(e).player.length, UNIT_QUEUE_CAP);
});

test('waiting cancellation refunds, active cancellation fails', () => {
  const e = engine();
  e.buyUnit('player', 0);
  e.buyUnit('player', 1);
  const paid = e.gold.player;
  assert.equal(cancelQueuedUnit(e, 'player', 0), false);
  assert.equal(e.gold.player, paid);
  assert.equal(cancelQueuedUnit(e, 'player', 1), true);
  assert.equal(e.gold.player, paid + AGES[0].units[1].cost);
  assert.equal(getProductionQueues(e).player.length, 1);
  assert.equal(cancelQueuedUnit(e, 'player', 9), false);
});

test('ready unit waits at living cap and spawns when slot opens', () => {
  const e = engine();
  e.units = Array.from({ length: LIVING_UNIT_CAP }, (_, i) => living('player', -(i + 1)));
  e.buyUnit('player', 0);
  e.update(1.5);
  assert.equal(getProductionQueues(e).player[0].remaining, 0);
  assert.equal(e.getSnapshot().productionQueue[0].ready, true);
  assert.equal(e.units.filter((u) => u.side === 'player' && u.dieT === 0).length, LIVING_UNIT_CAP);
  e.units[0].dieT = 0.45;
  e.update(0.01);
  assert.equal(getProductionQueues(e).player.length, 0);
  assert.equal(e.units.filter((u) => u.side === 'player' && u.dieT === 0).length, LIVING_UNIT_CAP);
});

test('queued unit keeps purchase-age definition after evolution', () => {
  const e = engine();
  const stone = AGES[0].units[0];
  e.buyUnit('player', 0);
  e.xp.player = EVOLVE_COSTS[0];
  assert.equal(e.evolve('player'), true);
  e.update(1.5);
  assert.equal(e.units[0].def, stone);
  assert.notEqual(e.units[0].def, AGES[1].units[0]);
});

test('pause freezes production', () => {
  const e = engine();
  e.buyUnit('player', 1);
  e.paused = true;
  e.update(10);
  assert.equal(getProductionQueues(e).player[0].remaining, 2.5);
  assert.equal(e.units.length, 0);
});

test('match end rejects actions and base destruction clears queues', () => {
  const e = engine();
  e.buyUnit('player', 0);
  e.buyUnit('enemy', 1);
  e.damageBase('enemy', 1000000);
  assert.equal(e.over, true);
  assert.equal(e.winner, 'player');
  assert.equal(getProductionQueues(e).player.length, 0);
  assert.equal(getProductionQueues(e).enemy.length, 0);
  assert.equal(e.buyUnit('player', 0), false);
  assert.equal(cancelQueuedUnit(e, 'player', 1), false);
});

test('AI commits purchases to queue and respects capacity', () => {
  const e = engine();
  const original = Math.random;
  Math.random = () => 0.9;
  try {
    e.runAI('enemy', DIFFICULTIES[3]);
    assert.ok(getProductionQueues(e).enemy.length > 0);
    assert.equal(e.units.filter((u) => u.side === 'enemy').length, 0);
    getProductionQueues(e).enemy.length = 0;
    for (let i = 0; i < UNIT_QUEUE_CAP; i++) assert.equal(e.buyUnit('enemy', 0), true);
    const gold = e.gold.enemy;
    e.runAI('enemy', DIFFICULTIES[3]);
    assert.equal(getProductionQueues(e).enemy.length, UNIT_QUEUE_CAP);
    assert.equal(e.gold.enemy, gold);
  } finally {
    Math.random = original;
  }
});
