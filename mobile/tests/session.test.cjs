const test = require('node:test');
const assert = require('node:assert/strict');
const memory = () => {
  const values = new Map();
  return { getItem: async k => values.get(k) || null, setItem: async (k, v) => { values.set(k, v); }, removeItem: async k => { values.delete(k); } };
};
const row = { id: 'session-1', owner_id: 'phone', watch_user_id: 'watch', selected_character: 'eric', revision: 0 };
function fakeClient() {
  const channels = new Set();
  const client = {
    row: { ...row }, channels,
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-token', user: { id: 'phone' } } } }) },
    realtime: { setAuth: async () => {} },
    rpc: async () => ({ data: [client.row] }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: client.row }) }) }) }),
    channel: () => {
      const channel = { on(_, __, fn) { channel.event = fn; return channel; },
        subscribe(fn) { channel.status = fn; channels.add(channel); queueMicrotask(() => fn('SUBSCRIBED')); return channel; } };
      return channel;
    },
    removeChannel: async channel => { channels.delete(channel); channel.status('CLOSED'); },
  };
  return client;
}
test('concurrent connects share one channel; disconnect discards stale and out-of-order events', async () => {
  const { createSessionLink } = await import('../../shared/sessionClient.js');
  const client = fakeClient(), link = createSessionLink({ client, role: 'phone', storage: memory() });
  const first = link.connect(); assert.equal(link.connect(), first); await first;
  await link.connect(); assert.equal(client.channels.size, 1);
  const channel = [...client.channels][0];
  channel.event({ new: { ...row, selected_character: 'harvey', revision: 2 } });
  channel.event({ new: { ...row, selected_character: 'eber', revision: 1 } });
  assert.equal(link.snapshot().session.selected_character, 'harvey');
  await link.disconnect();
  channel.event({ new: { ...row, selected_character: 'eber', revision: 3 } });
  assert.equal(link.snapshot().session.selected_character, 'harvey');
  assert.equal(client.channels.size, 0); assert.equal(link.snapshot().status, 'idle');
});
test('revoked watch membership removes its subscription and remains unpaired', async () => {
  const { createSessionLink } = await import('../../shared/sessionClient.js');
  const storage = memory(); await storage.setItem('runericrun:linked-session:watch:v1', JSON.stringify(row));
  const client = fakeClient(), link = createSessionLink({ client, role: 'watch', storage });
  await link.connect(); assert.equal(client.channels.size, 1);
  client.row = null; await link.connect();
  assert.equal(link.snapshot().session, null); assert.equal(link.snapshot().status, 'unpaired');
  assert.equal(client.channels.size, 0);
});
test('pair response arriving after leaving the app persists selection without opening a channel', async () => {
  const { createSessionLink } = await import('../../shared/sessionClient.js');
  const client = fakeClient(), storage = memory();
  const link = createSessionLink({ client, role: 'watch', storage }); await link.connect();
  let release; client.rpc = () => new Promise(r => { release = r; });
  const pairing = link.pair('ABCD-1234');
  while (!release) await Promise.resolve();
  await link.disconnect(); release({ data: { ok: true, session: { ...row, selected_character: 'eber', revision: 1 } } });
  await pairing;
  assert.equal(client.channels.size, 0); assert.equal(link.snapshot().status, 'idle');
  assert.equal(link.snapshot().session.selected_character, 'eber');
  await link.disconnect();
  assert.match(await storage.getItem('runericrun:linked-session:watch:v1'), /eber/);
});
test('score and pairing login requests share the same anonymous identity', async () => {
  const { ensureAnonymousSession } = await import('../../shared/authSession.js');
  let calls = 0;
  const session = { access_token: 'test', user: { id: 'same-user' } };
  const client = { auth: {
    getSession: async () => ({ data: { session: null } }),
    signInAnonymously: async () => { calls++; return { data: { session } }; },
  } };
  const [a, b] = await Promise.all([ensureAnonymousSession(client), ensureAnonymousSession(client)]);
  assert.equal(a, b); assert.equal(calls, 1);
});
