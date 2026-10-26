const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { initialGame, jump } = require('../dist-test/game.js');
const until = async (check, label, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (!check()) { if (Date.now() > deadline) throw new Error(`Timeout: ${label}`); await new Promise(r => setTimeout(r, 40)); }
};
const delay = ms => new Promise(r => setTimeout(r, ms));
const memory = () => {
  const data = new Map();
  return { getItem: async k => data.get(k) || null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async k => { data.delete(k); } };
};
(async () => {
  const { createSessionLink } = await import('../../shared/sessionClient.js');
  const { createJumpControl, controlTopic } = await import('../../shared/jumpControl.js');
  const { withoutBroadcastHttp } = await import('../../shared/broadcastFetch.js');
  let httpBroadcasts = 0, runWrites = 0;
  const clients = Array.from({ length: 3 }, () => createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: withoutBroadcastHttp((input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/realtime/v1/api/broadcast')) httpBroadcasts++;
        if (url.includes('/rest/v1/runs') && init?.method === 'POST') runWrites++;
        return fetch(input, { ...init, signal: AbortSignal.timeout(10000) });
      }) },
    }));
  const [phone, watch, outsider] = clients;
  const p = createSessionLink({ client: phone, role: 'phone', storage: memory() });
  const w = createSessionLink({ client: watch, role: 'watch', storage: memory() });
  const pc = createJumpControl({ client: phone, role: 'phone', uuid: randomUUID });
  const wc = createJumpControl({ client: watch, role: 'watch', uuid: randomUUID });
  const unsubs = [p.subscribe(s => { void pc.setSession(s.session, s.status === 'online'); }),
    w.subscribe(s => { void wc.setSession(s.session, s.status === 'online'); })];
  const sent = [];
  const originalChannel = watch.channel.bind(watch);
  let watchChannel;
  watch.channel = (...args) => {
    const channel = originalChannel(...args);
    if (args[0].startsWith('runericrun:control:')) {
      watchChannel = channel;
      const send = channel.send.bind(channel);
      channel.send = (message, options) => { if (message.event === 'jump') sent.push(message); return send(message, options); };
    }
    return channel;
  };
  try {
    await Promise.all([p.connect(), w.connect()]);
    const code = await p.createPairCode(); await w.pair(code.code);
    await until(() => pc.snapshot().connected && wc.snapshot().connected, 'private channels subscribed');
    const pAuth = await phone.auth.getSession(), wAuth = await watch.auth.getSession();
    assert.notEqual(pAuth.data.session.user.id, wAuth.data.session.user.id);
    await until(() => wc.snapshot().status === 'idle', 'phone waiting in home screen');
    assert.equal(await wc.sendJump(), false);
    let received = 0, world = initialGame(); const runId = randomUUID();
    const receive = () => { received++; world = jump(world, 390); };
    pc.setGame({ runId, active: true }, receive);
    await until(() => wc.snapshot().ready, 'active game readiness');
    const before = await phone.from('runs').select('id', { count: 'exact' });
    assert.equal(await wc.sendJump(), true); await until(() => received === 1, 'jump reaches phone');
    assert.ok(world.velocity > 0);
    const duplicate = sent[0];
    await watchChannel.send(duplicate, { timeout: 900 }); await delay(200); assert.equal(received, 1);
    const velocity = world.velocity;
    assert.equal(await wc.sendJump(), true); await until(() => received === 2, 'second unique command');
    assert.equal(world.velocity, velocity, 'Air jump must not change velocity');
    pc.setGame({ runId, active: false });
    await until(() => !wc.snapshot().ready, 'pause disables watch');
    assert.equal(await wc.sendJump(), false);
    pc.setGame({ runId: randomUUID(), active: true }, receive);
    await until(() => wc.snapshot().ready, 'next run ready');
    await watchChannel.send(duplicate, { timeout: 900 }); await delay(200); assert.equal(received, 2);
    await pc.setSession(null, false);
    await until(() => !wc.snapshot().ready, 'disconnected phone expires', 6000);
    const sendsBeforeOffline = sent.length; assert.equal(await wc.sendJump(), false); assert.equal(sent.length, sendsBeforeOffline);
    await pc.setSession(p.snapshot().session, true);
    await until(() => wc.snapshot().ready, 'reconnected phone handshake');
    await delay(150); assert.equal(received, 2, 'No buffered jumps after reconnect');
    await watchChannel.send(duplicate, { timeout: 900 }); await delay(150); assert.equal(received, 2);
    assert.equal(await wc.sendJump(), true); await until(() => received === 3, 'new jump after reconnect');
    const stranger = await outsider.auth.signInAnonymously(); if (stranger.error) throw stranger.error;
    await outsider.realtime.setAuth(stranger.data.session.access_token);
    const topic = controlTopic(p.snapshot().session);
    const unauthorized = outsider.channel(topic, { config: { private: true, broadcast: { ack: true } } });
    const strangerStatus = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Outsider authorization timeout')), 12000);
      unauthorized.on('broadcast', { event: 'control_state' }, () => {}).subscribe(status => {
        if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); resolve(status); }
      });
    });
    assert.equal(strangerStatus, 'CHANNEL_ERROR', 'An unrelated account must not join the private channel');
    const after = await phone.from('runs').select('id', { count: 'exact' });
    assert.equal(after.count, before.count); assert.equal(runWrites, 0); assert.equal(httpBroadcasts, 0);
    assert.equal(phone.getChannels().filter(c => c.topic.includes('runericrun:control:')).length, 1);
    await p.unlink(); await w.connect();
    await until(() => !wc.snapshot().ready && !pc.snapshot().connected, 'unlink removes control authorization');
    console.log(JSON.stringify({ pairedDistinctUsers: true, privateBroadcast: true, jumpDelivered: true,
      duplicateIgnored: true, airJumpBlocked: true, pauseDisabled: true, oldRunIgnored: true,
      offlineDropped: true, reconnectWithoutReplay: true, outsiderRejected: true, unlinkStopsControl: true,
      jumpOrdersDelivered: received, runWrites, httpBroadcasts, topic, testPhoneUserId: pAuth.data.session.user.id }));
  } finally {
    unsubs.forEach(fn => fn());
    await Promise.all([pc.disconnect(), wc.disconnect(), p.disconnect(), w.disconnect()]);
    await Promise.all(clients.map(async c => { await c.removeAllChannels(); await c.auth.signOut({ scope: 'local' }); }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
