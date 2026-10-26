import { ensureAnonymousSession } from './authSession.js';

const validCharacter = value => ['eric', 'harvey', 'eber'].includes(value);
const validSession = row => row && typeof row.id === 'string' && validCharacter(row.selected_character)
  && Number.isSafeInteger(Number(row.revision));

export function createSessionLink({ client, role, storage }) {
  const key = `runericrun:linked-session:${role}:v1`;
  let state = { session: null, status: client ? 'idle' : 'offline', error: null };
  let channel = null;
  let active = false;
  let generation = 0;
  let connection = null;
  let cacheLoaded = false;
  let cacheWrites = Promise.resolve();
  let realtimeOnline = false;
  const listeners = new Set();
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn(state)); };
  const persist = row => {
    const json = row ? JSON.stringify(row) : null;
    cacheWrites = cacheWrites.catch(() => {}).then(() => json ? storage.setItem(key, json) : storage.removeItem(key));
    cacheWrites.catch(() => {});
  };
  const apply = row => {
    if (!validSession(row)) return false;
    if (state.session?.id === row.id && Number(row.revision) < Number(state.session.revision)) return false;
    emit({ session: row, error: null });
    persist(row);
    return true;
  };
  const read = async epoch => {
    if (!state.session || !active || epoch !== generation) return;
    const result = await client.from('game_sessions').select('*').eq('id', state.session.id).maybeSingle();
    if (!active || epoch !== generation) return;
    if (result.error) throw result.error;
    if (!result.data) {
      generation += 1;
      const previous = channel;
      channel = null;
      realtimeOnline = false;
      emit({ session: null, status: 'unpaired', error: 'Vuelve a vincular el reloj.' });
      persist(null);
      if (previous) await client.removeChannel(previous);
      return;
    }
    apply(result.data);
    emit({ status: realtimeOnline ? 'online' : 'connecting' });
  };
  const disconnect = async () => {
    active = false;
    generation += 1;
    realtimeOnline = false;
    const previous = channel;
    channel = null;
    connection = null;
    emit({ status: client ? 'idle' : 'offline' });
    if (previous) await client.removeChannel(previous);
    await cacheWrites.catch(() => {});
  };
  const connect = () => {
    if (connection) return connection;
    if (active && channel) {
      const epoch = generation;
      return read(epoch).catch(error => {
        if (active && epoch === generation) emit({ status: 'offline', error: error.message });
      });
    }
    active = true;
    const epoch = ++generation;
    emit({ status: 'connecting', error: null });
    const job = (async () => {
      if (!cacheLoaded) {
        cacheLoaded = true;
        try {
          const cached = JSON.parse(await storage.getItem(key) || 'null');
          if (validSession(cached) && active && epoch === generation) apply(cached);
        } catch {}
      }
      if (!client) { emit({ status: 'offline', error: 'Supabase no está configurado.' }); return; }
      const auth = await ensureAnonymousSession(client);
      if (!active || epoch !== generation) return;
      await client.realtime.setAuth(auth.access_token);
      if (!active || epoch !== generation) return;
      if (role === 'phone') {
        const result = await client.rpc('get_game_session');
        if (result.error) throw result.error;
        if (!active || epoch !== generation) return;
        const row = Array.isArray(result.data) ? result.data[0] : result.data;
        if (!validSession(row)) throw new Error('No se pudo recuperar la sesión del teléfono.');
        apply(row);
      } else if (!state.session) { emit({ status: 'unpaired' }); return; }
      const sessionId = state.session.id;
      channel = client.channel(`characters:${role}:${sessionId}:${epoch}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, payload => {
          if (active && epoch === generation) apply(payload.new);
        }).subscribe(status => {
          if (!active || epoch !== generation) return;
          realtimeOnline = status === 'SUBSCRIBED';
          if (realtimeOnline) {
            void read(epoch).catch(error => {
              if (active && epoch === generation) emit({ status: 'offline', error: error.message });
            });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            emit({ status: 'offline', error: 'Reconectando con Supabase…' });
          }
        });
      await read(epoch);
    })().catch(error => {
      if (active && epoch === generation) emit({ status: 'offline', error: error.message || 'Sin conexión.' });
    }).finally(() => { if (connection === job) connection = null; });
    connection = job;
    return job;
  };
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    connect,
    disconnect,
    async createPairCode() {
      if (!client || role !== 'phone') throw new Error('Abre la vinculación en el teléfono.');
      await ensureAnonymousSession(client);
      const result = await client.rpc('create_pair_code');
      if (result.error) throw result.error;
      return result.data;
    },
    async pair(code) {
      if (!client || role !== 'watch') throw new Error('Supabase no está configurado.');
      const epoch = generation;
      await ensureAnonymousSession(client);
      const result = await client.rpc('pair_watch', { p_code: code });
      if (result.error) throw result.error;
      if (!result.data?.ok || !validSession(result.data.session)) throw new Error(result.data?.error || 'No se pudo vincular.');
      const reconnect = active && epoch === generation;
      await disconnect();
      apply(result.data.session);
      if (reconnect) await connect();
      return state.session;
    },
    async selectCharacter(character) {
      if (!validCharacter(character)) throw new Error('Personaje inválido.');
      if (!client || !state.session) throw new Error('Vincula el reloj con el teléfono.');
      await ensureAnonymousSession(client);
      const result = await client.from('game_sessions').update({ selected_character: character })
        .eq('id', state.session.id).select('*').single();
      if (result.error) throw result.error;
      if (!validSession(result.data)) throw new Error('La vinculación ya no está autorizada.');
      apply(result.data);
      return result.data;
    },
    async unlink() {
      if (!client || role !== 'phone') return;
      await ensureAnonymousSession(client);
      const result = await client.rpc('unlink_watch');
      if (result.error) throw result.error;
      await read(generation);
    },
  };
}
