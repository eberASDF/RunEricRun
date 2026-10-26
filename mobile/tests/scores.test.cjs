const test = require('node:test');
const assert = require('node:assert/strict');
const { createScoreStore } = require('../dist-test/scoreStore.js');
const row = (id, score = 10, character_id = 'eric') => ({ id, score, character_id, created_at: '2026-10-26T00:00:00.000Z' });
function memory() {
  let value = null;
  return { getItem: async () => value, setItem: async (_, next) => { value = next; } };
}

test('offline results survive a store restart and a repeated enqueue', async () => {
  const storage = memory();
  const offline = createScoreStore(storage, null);
  await offline.enqueue(row('one'));
  await offline.enqueue(row('one'));
  assert.equal((await offline.leaderboard()).pending, 1);
  const cloud = new Map();
  const resumed = createScoreStore(storage, { insert: async r => { cloud.set(r.id, r); }, top: async () => [...cloud.values()] });
  const result = await resumed.leaderboard();
  assert.equal(cloud.size, 1);
  assert.equal(result.pending, 0);
  assert.equal(result.online, true);
});

test('a run finishing during upload is preserved and parallel syncs share one request', async () => {
  const cloud = new Map();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let started;
  const uploading = new Promise(resolve => { started = resolve; });
  const store = createScoreStore(memory(), {
    insert: async r => { started(); await gate; cloud.set(r.id, r); },
    top: async () => [...cloud.values()],
  });
  await store.enqueue(row('first'));
  const firstSync = store.sync();
  assert.equal(store.sync(), firstSync);
  await uploading;
  await store.enqueue(row('second', 20));
  release();
  await firstSync;
  const result = await store.leaderboard();
  assert.equal(cloud.size, 2);
  assert.deepEqual(result.rows.map(r => r.id), ['second', 'first']);
  assert.equal(result.pending, 0);
});

test('a lost response after server commit retries the same UUID without duplicating', async () => {
  const cloud = new Map();
  let fail = true;
  const store = createScoreStore(memory(), {
    insert: async r => { cloud.set(r.id, r); if (fail) { fail = false; throw new Error('Connection lost'); } },
    top: async () => [...cloud.values()],
  });
  await store.enqueue(row('stable-id'));
  const offline = await store.leaderboard();
  assert.equal(offline.online, false);
  assert.equal(offline.pending, 1);
  const recovered = await store.leaderboard();
  assert.equal(cloud.size, 1);
  assert.equal(recovered.pending, 0);
  assert.equal(recovered.online, true);
});

test('leaderboard keeps five scores descending and local write failures are reported', async () => {
  const store = createScoreStore(memory(), null);
  for (let i = 0; i < 8; i++) await store.enqueue(row(String(i), i * 10));
  assert.deepEqual((await store.leaderboard()).rows.map(r => r.score), [70, 60, 50, 40, 30]);
  const failed = createScoreStore({ getItem: async () => null, setItem: async () => { throw new Error('Disk full'); } }, null);
  await assert.rejects(failed.enqueue(row('failed')), /Disk full/);
});

test('offline queue preserves characters and migrates legacy Eric history without changing UUIDs', async () => {
  const storage = memory();
  const legacy = row('old-eric', 90); delete legacy.character_id;
  await storage.setItem('', JSON.stringify([legacy]));
  const store = createScoreStore(storage, null);
  await store.enqueue(row('harvey-game', 100, 'harvey'));
  await store.enqueue(row('eber-game', 80, 'eber'));
  assert.deepEqual((await store.leaderboard('eric')).rows.map(r => [r.id, r.character_id]), [['old-eric', 'eric']]);
  assert.deepEqual((await store.leaderboard('harvey')).rows.map(r => r.id), ['harvey-game']);
  const cloud = new Map();
  const resumed = createScoreStore(storage, {
    insert: async r => cloud.set(r.id, r),
    top: async character => [...cloud.values()].filter(r => r.character_id === character),
  });
  assert.deepEqual((await resumed.leaderboard('eber')).rows.map(r => r.id), ['eber-game']);
  assert.equal(cloud.size, 3);
  assert.equal(cloud.get('old-eric').character_id, 'eric');
  assert.equal((await resumed.leaderboard('harvey')).pending, 0);
});

test('equal scores sort by date then UUID, and duplicate enqueue never changes the run character', async () => {
  const store = createScoreStore(memory(), null);
  await store.enqueue(row('b', 25, 'harvey'));
  await store.enqueue(row('a', 25, 'harvey'));
  await store.enqueue({ ...row('c', 25, 'harvey'), created_at: '2026-10-25T00:00:00.000Z' });
  await store.enqueue(row('b', 999, 'eber'));
  assert.deepEqual((await store.leaderboard('harvey')).rows.map(r => r.id), ['c', 'a', 'b']);
  assert.equal((await store.leaderboard('eber')).rows.length, 0);
});
