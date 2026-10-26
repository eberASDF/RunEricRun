const test = require('node:test');
const assert = require('node:assert/strict');
const { initialGame, jump, scoreOf, step } = require('../dist-test/game.js');

test('jump has fixed height, gravity and no midair double jump', () => {
  const first = jump(initialGame(), 400);
  assert.ok(first.velocity > 0);
  const airborne = step(first, 0.05, 800, 400);
  assert.ok(airborne.lift > 0);
  assert.equal(jump(airborne, 400), airborne);
  let landed = airborne;
  for (let i = 0; i < 30; i++) landed = step(landed, 0.05, 800, 400);
  assert.equal(landed.lift, 0);
  assert.ok(jump(landed, 400).velocity > 0);
});

test('speed and integer score use elapsed time, independent of frame rate', () => {
  const seed = { ...initialGame(), spawnIn: 999 };
  let fast = seed;
  let slow = seed;
  for (let i = 0; i < 100; i++) fast = step(fast, 0.01, 800, 400);
  for (let i = 0; i < 25; i++) slow = step(slow, 0.04, 800, 400);
  assert.equal(scoreOf(fast), 10);
  assert.equal(scoreOf(slow), 10);
  assert.ok(Math.abs(fast.distance - slow.distance) < 1);
  const singleSlowFrame = step(seed, 0.1, 800, 400);
  assert.ok(Math.abs(singleSlowFrame.elapsed - 0.1) < 0.00001);
});

test('collision ends play and reset clears all state', () => {
  const game = { ...initialGame(), obstacles: [{ id: 1, x: 125, width: 32, height: 95 }] };
  const hit = step(game, 0.02, 800, 400);
  assert.equal(hit.status, 'over');
  assert.equal(step(hit, 1, 800, 400), hit);
  assert.deepEqual(initialGame().obstacles, []);
  assert.equal(scoreOf(initialGame()), 0);
});
