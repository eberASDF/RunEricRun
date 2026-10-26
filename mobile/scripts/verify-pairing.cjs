const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const { createSupabaseGateway } = require('../dist-test/supabaseGateway.js');
const memory = () => {
  const data = new Map();
  return { getItem: async k => data.get(k) || null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async k => { data.delete(k); } };
};
const until = async (fn, label) => {
  const deadline = Date.now() + 15000;
  while (!fn()) { if (Date.now() > deadline) throw new Error(`Timeout: ${label}`); await new Promise(r => setTimeout(r, 75)); }
};
(async () => {
  const { createSessionLink } = await import('../../shared/sessionClient.js');
  const clients = Array.from({ length: 3 }, () => createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    }));
  const [phone, watch, outsider] = clients;
  const phoneStorage = memory(), watchStorage = memory();
  const p = createSessionLink({ client: phone, role: 'phone', storage: phoneStorage });
  const w = createSessionLink({ client: watch, role: 'watch', storage: watchStorage });
  if (process.env.DEBUG_PAIR) {
    p.subscribe(s => console.log('phone', s.status, s.session?.selected_character, s.session?.revision, s.error));
    w.subscribe(s => console.log('watch', s.status, s.session?.selected_character, s.session?.revision, s.error));
  }
  let restored;
  try {
    await Promise.all([p.connect(), w.connect()]);
    assert.equal(w.snapshot().status, 'unpaired');
    const code = await p.createPairCode();
    await w.pair(code.code);
    await until(() => p.snapshot().status === 'online' && w.snapshot().status === 'online', 'Realtime subscribed');
    const ids = await Promise.all(clients.slice(0, 2).map(c => c.auth.getSession().then(r => r.data.session.user.id)));
    assert.notEqual(ids[0], ids[1]);
    assert.equal(w.snapshot().session.id, p.snapshot().session.id);
    const sessionId = p.snapshot().session.id;
    await w.selectCharacter('harvey');
    await until(() => p.snapshot().session.selected_character === 'harvey', 'watch → phone Realtime');
    const pinned = p.snapshot().session.selected_character;
    await p.disconnect();
    await w.selectCharacter('eber');
    await p.connect();
    assert.equal(p.snapshot().session.selected_character, 'eber');
    await p.disconnect();
    restored = createSessionLink({ client: phone, role: 'phone', storage: phoneStorage });
    await restored.connect();
    assert.equal(restored.snapshot().session.selected_character, 'eber');
    assert.equal(pinned, 'harvey');
    const gateway = createSupabaseGateway(phone);
    const runs = [];
    for (const [character_id, score] of [['eric', 13], [pinned, 23], ['eber', 33]]) {
      const row = { id: randomUUID(), character_id, score, created_at: new Date().toISOString() };
      await gateway.insert(row); await gateway.insert(row); runs.push(row);
      const top = await gateway.top(character_id);
      assert.equal(top.length, 1); assert.equal(top[0].character_id, character_id); assert.equal(top[0].score, score);
    }
    const all = await phone.from('runs').select('id', { count: 'exact' });
    assert.equal(all.count, 3);
    const stranger = await outsider.auth.signInAnonymously(); if (stranger.error) throw stranger.error;
    const denied = await outsider.from('game_sessions').select('*').eq('id', sessionId);
    assert.deepEqual(denied.data, []);
    const deniedWrite = await outsider.from('game_sessions').update({ selected_character: 'eric' }).eq('id', sessionId).select('*');
    assert.deepEqual(deniedWrite.data, []);
    const forbidden = await watch.from('game_sessions').update({ owner_id: ids[1] }).eq('id', sessionId);
    assert.ok(forbidden.error, 'Membership columns must not be writable');
    const reused = await outsider.rpc('pair_watch', { p_code: code.code });
    assert.equal(reused.data.ok, false);
    await restored.unlink();
    await w.connect();
    assert.equal(w.snapshot().status, 'unpaired');
    console.log(JSON.stringify({ distinctAnonymousDevices: true, pairing: true, realtimeWatchToPhone: true,
      reconnectSnapshot: true, restartPersistence: true, frozenRunCharacter: pinned, separateLeaderboards: true,
      UUIDDeduplication: true, outsiderRLS: true, membershipProtected: true, singleUseCode: true, unlink: true,
      testOwnerId: ids[0], testRunIds: runs.map(r => r.id) }));
  } finally {
    await Promise.all([p.disconnect(), w.disconnect(), restored?.disconnect()]);
    await Promise.all(clients.map(async c => { await c.removeAllChannels(); await c.auth.signOut({ scope: 'local' }); }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
