const test = require('node:test');
const assert = require('node:assert/strict');
const { AGES, EVOLVE_COSTS } = require('../.test-dist/game/data.js');
require('../.test-dist/game/production-engine.js');
const { GameEngine } = require('../.test-dist/game/engine.js');
const { getProductionQueues } = require('../.test-dist/game/production-engine.js');
const { buildSnapshot, GuestSync, HostSync } = require('../.test-dist/mp/sync.js');

function session() {
  return {
    onMessage: null,
    onPeerLeave: null,
    sent: [],
    send(event, payload) { this.sent.push([event, payload]); },
  };
}

test('packs both queues and mirrors enemy queue to guest player', () => {
  const engine = new GameEngine(1);
  engine.aiEnabled = false;
  engine.gold.player = engine.gold.enemy = 10000;
  engine.buyUnit('player', 0);
  engine.buyUnit('enemy', 2);
  engine.update(0.5);
  const snap = buildSnapshot(engine);
  assert.deepEqual(snap[14], [[[0, 10]], [[2, 35]]]);
  const s = session();
  const guest = new GuestSync(s);
  s.onMessage('state', snap);
  assert.deepEqual(guest.getSnapshot().productionQueue, [
    { ageIdx: 0, unitIdx: 2, duration: 4, remaining: 3.5, ready: false },
  ]);
});

test('stable unit code preserves old-age spawned unit after evolution', () => {
  const engine = new GameEngine(1);
  engine.aiEnabled = false;
  engine.gold.player = 10000;
  engine.buyUnit('player', 0);
  engine.update(1.5);
  engine.xp.player = EVOLVE_COSTS[0];
  engine.evolve('player');
  const snap = buildSnapshot(engine);
  assert.equal(snap[7][0][2], 0);
  assert.equal(engine.units[0].def, AGES[0].units[0]);
});

test('host validates guest cancellation against enemy queue', () => {
  const engine = new GameEngine(1);
  engine.gold.enemy = 10000;
  engine.buyUnit('enemy', 0);
  engine.buyUnit('enemy', 1);
  const gold = engine.gold.enemy;
  const s = session();
  new HostSync(engine, s);
  s.onMessage('action', { type: 'cancelUnit', idx: 1 });
  assert.equal(getProductionQueues(engine).enemy.length, 1);
  assert.equal(engine.gold.enemy, gold + AGES[0].units[1].cost);
  const after = engine.gold.enemy;
  s.onMessage('action', { type: 'cancelUnit', idx: 0 });
  assert.equal(getProductionQueues(engine).enemy.length, 1);
  assert.equal(engine.gold.enemy, after);
});
