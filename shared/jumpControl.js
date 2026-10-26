import { ensureAnonymousSession } from './authSession.js';

const TTL = 3500;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function commandId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const controlTopic = session => session?.id && session.watch_user_id
  ? `runericrun:control:${session.id}:${session.watch_user_id}` : null;

export function createJumpControl({ client, role, uuid = commandId, now = Date.now,
  timers = { setInterval: (fn, ms) => globalThis.setInterval(fn, ms), clearInterval: id => globalThis.clearInterval(id) } }) {
  let state = { connected: false, ready: false, status: 'unpaired' };
  const listeners = new Set();
  let session = null, topic = null, channel = null, joined = false, generation = 0, connection = null, interval = null;
  let game = null, receiver = null, receiverEpoch = uuid(), watchEpoch = null, peer = null;
  let lastPeerAt = 0, lastSentAt = -Infinity, stateSequence = 0, receivedSequence = -1;
  const publisherId = uuid(), retiredPublishers = new Set();
  let remotePublisher = null;
  const seen = new Set();
  const socketReady = () => Boolean(joined && channel?.state === 'joined' && client?.realtime.isConnected());
  const emit = () => {
    const connected = socketReady();
    const fresh = lastPeerAt > 0 && now() - lastPeerAt < TTL;
    const ready = role === 'watch' && connected && fresh && Boolean(peer?.active);
    const status = !controlTopic(session) ? 'unpaired' : !connected ? 'connecting' : !fresh ? 'waiting'
      : role === 'watch' && !peer?.active ? 'idle' : 'connected';
    if (state.connected === connected && state.ready === ready && state.status === status) return;
    state = { connected, ready, status }; listeners.forEach(fn => fn(state));
  };
  const rotate = () => { receiverEpoch = uuid(); seen.clear(); };
  const send = (event, payload) => {
    if (!socketReady()) return Promise.resolve(false);
    return channel.send({ type: 'broadcast', event, payload: { ...payload, v: 1, session_id: session.id } }, { timeout: 900 })
      .then(result => result === 'ok', () => false);
  };
  const publish = () => {
    if (role !== 'phone' || !watchEpoch) return Promise.resolve(false);
    return send('control_state', { publisher_id: publisherId, watch_epoch: watchEpoch, receiver_epoch: receiverEpoch,
      run_id: game?.runId || null, active: Boolean(game?.active && receiver), sequence: ++stateSequence });
  };
  const tick = () => {
    if (lastPeerAt && now() - lastPeerAt >= TTL) {
      lastPeerAt = 0; peer = null;
      if (role === 'phone') { watchEpoch = null; rotate(); }
    }
    emit();
    if (!socketReady() || now() - lastSentAt < 1000) return;
    lastSentAt = now();
    if (role === 'phone') void publish();
    else void send('control_sync', { watch_epoch: watchEpoch });
  };
  const stop = () => {
    generation++; joined = false; connection = null;
    const previous = channel; channel = null;
    if (interval !== null) timers.clearInterval(interval);
    interval = null; peer = null; watchEpoch = null; lastPeerAt = 0; receivedSequence = -1; lastSentAt = -Infinity;
    remotePublisher = null; retiredPublishers.clear();
    rotate(); emit();
    return previous ? client.removeChannel(previous).catch(() => {}) : Promise.resolve();
  };
  const setSession = (next, enabled = true) => {
    session = next;
    const nextTopic = enabled ? controlTopic(next) : null;
    if (nextTopic === topic && (channel || connection || !nextTopic)) return connection || Promise.resolve();
    topic = nextTopic;
    const removing = stop();
    if (!topic || !client) { emit(); return removing; }
    const epoch = generation;
    const current = () => epoch === generation && Boolean(channel);
    const job = (async () => {
      await removing;
      const auth = await ensureAnonymousSession(client);
      if (epoch !== generation) return;
      const expected = role === 'phone' ? session.owner_id : session.watch_user_id;
      if (auth.user.id !== expected) throw new Error('Device is not a member of this control session.');
      await client.realtime.setAuth(auth.access_token);
      if (epoch !== generation) return;
      const valid = payload => payload?.v === 1 && payload.session_id === session.id;
      channel = client.channel(topic, { config: { private: true, broadcast: { ack: true, self: false } } })
        .on('broadcast', { event: 'control_sync' }, ({ payload }) => {
          if (!current() || role !== 'phone' || !valid(payload) || !uuidPattern.test(payload.watch_epoch)) return;
          if (watchEpoch !== payload.watch_epoch || now() - lastPeerAt >= TTL) rotate();
          watchEpoch = payload.watch_epoch; lastPeerAt = now(); emit(); void publish();
        })
        .on('broadcast', { event: 'control_state' }, ({ payload }) => {
          if (!current() || role !== 'watch' || !valid(payload) || payload.watch_epoch !== watchEpoch
            || !uuidPattern.test(payload.receiver_epoch) || typeof payload.active !== 'boolean'
            || !uuidPattern.test(payload.publisher_id) || retiredPublishers.has(payload.publisher_id)
            || !Number.isSafeInteger(payload.sequence)
            || (payload.active && !uuidPattern.test(payload.run_id))) return;
          if (remotePublisher !== payload.publisher_id) {
            if (remotePublisher) retiredPublishers.add(remotePublisher);
            remotePublisher = payload.publisher_id; receivedSequence = -1;
          }
          if (payload.sequence <= receivedSequence) return;
          receivedSequence = payload.sequence; peer = payload; lastPeerAt = now(); emit();
        })
        .on('broadcast', { event: 'jump' }, ({ payload }) => {
          if (!current() || role !== 'phone' || !socketReady() || !valid(payload)
            || !game?.active || !receiver || !lastPeerAt || now() - lastPeerAt >= TTL
            || payload.run_id !== game.runId || payload.receiver_epoch !== receiverEpoch
            || payload.watch_epoch !== watchEpoch || !uuidPattern.test(payload.id) || seen.has(payload.id)) return;
          seen.add(payload.id);
          receiver(now() + 700);
        })
        .subscribe(status => {
          if (!current()) return;
          joined = status === 'SUBSCRIBED';
          if (joined) {
            rotate(); peer = null; lastPeerAt = 0; receivedSequence = -1;
            remotePublisher = null; retiredPublishers.clear();
            watchEpoch = role === 'watch' ? uuid() : null;
            lastSentAt = -Infinity; tick();
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            peer = null; lastPeerAt = 0; rotate();
          }
          emit();
        });
      interval = timers.setInterval(tick, 250);
    })().catch(() => { if (epoch === generation) { joined = false; emit(); } })
      .finally(() => { if (connection === job) connection = null; });
    connection = job;
    return job;
  };
  return {
    snapshot: () => state,
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    setSession,
    disconnect() { topic = null; session = null; return stop(); },
    setGame(next, onJump = null) {
      if (game?.runId !== next?.runId || Boolean(game?.active) !== Boolean(next?.active)) rotate();
      game = next; receiver = onJump; void publish(); emit();
    },
    async sendJump() {
      tick();
      if (role !== 'watch' || !state.ready || !socketReady()) return false;
      const epoch = generation;
      const result = await send('jump', { id: uuid(), run_id: peer.run_id, receiver_epoch: peer.receiver_epoch, watch_epoch: watchEpoch });
      if (!result && epoch === generation) { peer = null; lastPeerAt = 0; emit(); }
      return result;
    },
  };
}
