const { createClient } = require('@supabase/supabase-js');
const { createScoreStore } = require('../dist-test/scoreStore.js');
const { createSupabaseGateway } = require('../dist-test/supabaseGateway.js');
const { randomUUID } = require('node:crypto');

(async () => {
  const client = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
    });
  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  const gateway = createSupabaseGateway(client);
  let local = null;
  const storage = { getItem: async () => local, setItem: async (_, value) => { local = value; } };
  const store = createScoreStore(storage, gateway);
  const row = { id: randomUUID(), character_id: 'eric', score: 0, created_at: new Date().toISOString() };
  await store.enqueue(row);
  await store.sync();
  await gateway.insert(row);
  const result = await store.leaderboard();
  const check = await client.from('runs').select('id,score', { count: 'exact' }).eq('id', row.id);
  if (check.error || check.count !== 1 || !result.online || result.pending !== 0) throw new Error('Cloud persistence verification failed');
  console.log(JSON.stringify({ anonymousSignIn: true, insert: true, duplicateReplayCount: check.count,
    leaderboard: result.online, pending: result.pending, testRunId: row.id, testUserId: signedIn.data.user.id }));
  await client.auth.signOut();
})().catch(error => { console.error(error.message); process.exitCode = 1; });
