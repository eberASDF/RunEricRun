const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initialGame, jump } = require('../dist-test/game.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup() {
  const { createJumpControl } = await import('../../shared/jumpControl.js');
  let clock = 1000;
  const intervals = new Set(), channels = new Set(), sent = [];
  const session = { id: randomUUID(), owner_id: 'phone', watch_user_id: 'watch' };
  const timers = { setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) };
  const client = role => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'test', user: { id: role } } } }) },
    realtime: { isConnected: () => true, setAuth: async () => {} },
    channel(topic, options) {
      assert.equal(options.config.private, true);
      const handlers = new Map();
      const channel = { topic, state: 'joining', handlers,
        on(type, { event }, fn) { assert.equal(type, 'broadcast'); handlers.set(event, fn); return channel; },
        subscribe(fn) { channel.status = fn; channels.add(channel); queueMicrotask(() => { channel.state = 'joined'; fn('SUBSCRIBED'); }); return channel; },
        send(message) { sent.push({ ...message, channel });
          queueMicrotask(() => { for (const other of channels) if (other !== channel && other.topic === topic)
            other.handlers.get(message.event)?.({ payload: message.payload }); });
          return Promise.resolve('ok');
        },
      };
      return channel;
    },
    removeChannel: async channel => { channels.delete(channel); channel.state = 'closed'; channel.status('CLOSED'); },
  });
  const pc = client('phone'), wc = client('watch');
  const p = createJumpControl({ client: pc, role: 'phone', uuid: randomUUID, now: () => clock, timers });
  const w = createJumpControl({ client: wc, role: 'watch', uuid: randomUUID, now: () => clock, timers });
  await Promise.all([p.setSession(session), w.setSession(session)]); await flush();
  return { p, w, pc, wc, session, sent, channels, intervals,
    createPhone: () => createJumpControl({ client: pc, role: 'phone', uuid: randomUUID, now: () => clock, timers }),
    advance: async ms => { clock += ms; [...intervals].forEach(fn => fn()); await flush(); },
    close: async () => { await Promise.all([p.disconnect(), w.disconnect()]); },
  };
}
test('private Broadcast handshake enables only an active run; IDs deduplicate and physics forbids an air jump', async () => {
  const f = await setup();
  try {
    assert.equal(f.w.snapshot().ready, false); assert.equal(await f.w.sendJump(), false);
    let world = initialGame(), deliveries = 0;
    const runId = randomUUID();
    f.p.setGame({ runId, active: true }, () => { deliveries++; world = jump(world, 390); }); await flush();
    assert.equal(f.w.snapshot().ready, true);
    assert.equal(await f.w.sendJump(), true); await flush();
    const velocity = world.velocity; assert.ok(velocity > 0); assert.equal(deliveries, 1);
    const command = f.sent.find(m => m.event === 'jump');
    const phoneChannel = [...f.channels].find(c => c !== command.channel);
    phoneChannel.handlers.get('jump')({ payload: command.payload });
    assert.equal(deliveries, 1);
    await f.w.sendJump(); await flush(); assert.equal(deliveries, 2); assert.equal(world.velocity, velocity);
    f.p.setGame({ runId, active: false }); await flush();
    assert.equal(f.w.snapshot().ready, false); assert.equal(await f.w.sendJump(), false);
    f.p.setGame({ runId: randomUUID(), active: true }, () => { deliveries++; }); await flush();
    phoneChannel.handlers.get('jump')({ payload: command.payload }); assert.equal(deliveries, 2);
  } finally { await f.close(); }
});
test('offline commands are discarded; reconnect rotates the receiver epoch and does not duplicate listeners', async () => {
  const f = await setup();
  try {
    let received = 0;
    f.p.setGame({ runId: randomUUID(), active: true }, () => { received++; }); await flush();
    await f.w.sendJump(); await flush(); assert.equal(received, 1);
    const old = f.sent.find(m => m.event === 'jump').payload;
    await f.p.setSession(null, false); await f.advance(4000);
    const count = f.sent.filter(m => m.event === 'jump').length;
    assert.equal(await f.w.sendJump(), false);
    assert.equal(f.sent.filter(m => m.event === 'jump').length, count);
    await f.p.setSession(f.session); await f.advance(1000); await flush();
    assert.equal(f.w.snapshot().ready, true); assert.equal(received, 1);
    for (let i = 0; i < 4; i++) { await f.p.setSession(f.session); await f.w.setSession(f.session); }
    assert.equal(f.channels.size, 2); assert.equal(f.intervals.size, 2);
    for (const ch of f.channels) ch.handlers.get('jump')({ payload: old });
    assert.equal(received, 1);
    await f.w.sendJump(); await flush(); assert.equal(received, 2);
  } finally { await f.close(); assert.equal(f.channels.size, 0); assert.equal(f.intervals.size, 0); }
});
test('receiver callbacks update without keeping stale game state and late events are ignored after exit', async () => {
  const f = await setup();
  try {
    let stale = 0, current = 0; const runId = randomUUID();
    f.p.setGame({ runId, active: true }, () => { stale++; }); await flush();
    f.p.setGame({ runId, active: true }, () => { current++; }); await flush();
    await f.w.sendJump(); await flush(); assert.equal(stale, 0); assert.equal(current, 1);
    const message = f.sent.find(m => m.event === 'jump');
    const phone = [...f.channels].find(c => c !== message.channel);
    await f.p.disconnect();
    phone.handlers.get('jump')({ payload: { ...message.payload, id: randomUUID() } });
    assert.equal(current, 1);
  } finally { await f.close(); }
});
test('Broadcast HTTP fallback is blocked while ordinary Auth and score requests remain available', async () => {
  const { withoutBroadcastHttp } = await import('../../shared/broadcastFetch.js');
  let calls = 0;
  const guarded = withoutBroadcastHttp(async () => { calls++; return 'ok'; });
  await assert.rejects(guarded('https://example.supabase.co/realtime/v1/api/broadcast'), /WebSocket/);
  await assert.rejects(guarded(new Request('https://example.supabase.co/realtime/v1/api/broadcast')), /WebSocket/);
  assert.equal(calls, 0);
  assert.equal(await guarded('https://example.supabase.co/rest/v1/runs'), 'ok');
  assert.equal(calls, 1);
});

test('a restarted phone with a new publisher is accepted even when its sequence restarts at one', async () => {
  const f = await setup(); let restarted;
  try {
    f.p.setGame({ runId: randomUUID(), active: true }, () => {}); await flush();
    await f.advance(1000); await f.advance(1000);
    const oldState = f.sent.filter(m => m.event === 'control_state').at(-1).payload;
    await f.p.disconnect();
    restarted = f.createPhone(); let received = 0;
    restarted.setGame({ runId: randomUUID(), active: true }, () => { received++; });
    await restarted.setSession(f.session); await f.advance(1000); await flush();
    assert.equal(f.w.snapshot().ready, true);
    const watch = [...f.channels].find(c => !c.handlers || c !== f.sent.filter(m => m.event === 'control_state').at(-1).channel);
    watch.handlers.get('control_state')({ payload: { ...oldState, sequence: 99999 } });
    await f.w.sendJump(); await flush(); assert.equal(received, 1);
  } finally { await restarted?.disconnect(); await f.close(); }
});

test('default heartbeat timers keep the browser global receiver when invoked through the timer adapter', async () => {
  const f = await setup(); const nativeSet = globalThis.setInterval, nativeClear = globalThis.clearInterval;
  let control, started = 0, cleared = 0;
  try {
    await f.p.disconnect();
    globalThis.setInterval = function (...args) { assert.equal(this, globalThis); started++; return nativeSet(...args); };
    globalThis.clearInterval = function (id) { assert.equal(this, globalThis); cleared++; return nativeClear(id); };
    const { createJumpControl } = await import('../../shared/jumpControl.js');
    control = createJumpControl({ client: f.pc, role: 'phone', uuid: randomUUID });
    await control.setSession(f.session); assert.equal(started, 1);
    await control.disconnect(); assert.equal(cleared, 1);
  } finally {
    await control?.disconnect(); globalThis.setInterval = nativeSet; globalThis.clearInterval = nativeClear; await f.close();
  }
});
