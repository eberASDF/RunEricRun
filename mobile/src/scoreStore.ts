import { CharacterId, isCharacterId } from './characterIds';
export type ScoreRecord = { id: string; character_id: CharacterId; score: number; created_at: string; synced?: boolean };
export type ScoreStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export type ScoreGateway = { insert(row: ScoreRecord): Promise<void>; top(character: CharacterId): Promise<ScoreRecord[]> };
const STORAGE_KEY = 'runericrun:scores:v1';

export function createScoreStore(storage: ScoreStorage, gateway: ScoreGateway | null) {
  let writes: Promise<unknown> = Promise.resolve();
  let syncing: Promise<boolean> | null = null;
  const read = async (): Promise<ScoreRecord[]> => {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error('El archivo local de puntajes no es válido.');
    return rows.map(row => {
      const character = row.character_id ?? 'eric';
      if (!isCharacterId(character)) throw new Error('Personaje local inválido.');
      return { ...row, character_id: character };
    });
  };
  const mutate = (fn: (rows: ScoreRecord[]) => ScoreRecord[]) => {
    const result = writes.then(async () => {
      const rows = fn(await read());
      await storage.setItem(STORAGE_KEY, JSON.stringify(rows));
    });
    writes = result.catch(() => {});
    return result;
  };
  const enqueue = (record: ScoreRecord) => mutate(rows => rows.some(r => r.id === record.id)
    ? rows : [...rows, { ...record, synced: false }]);
  const sync = (): Promise<boolean> => {
    if (!gateway) return Promise.resolve(false);
    if (syncing) return syncing;
    syncing = (async () => {
      await writes;
      for (const row of (await read()).filter(r => !r.synced)) {
        await gateway.insert(row);
        await mutate(rows => rows.map(r => r.id === row.id ? { ...r, synced: true } : r));
      }
      return true;
    })().finally(() => { syncing = null; });
    return syncing;
  };
  const leaderboard = async (character: CharacterId = 'eric') => {
    let online = false;
    let remote: ScoreRecord[] = [];
    let error: string | undefined;
    if (gateway) {
      try { await sync(); remote = await gateway.top(character); online = true; }
      catch (e) { error = e instanceof Error ? e.message : 'No se pudo conectar.'; }
    }
    await writes;
    const local = await read();
    const rows = [...new Map([...remote, ...local].map(r => [r.id, r])).values()]
      .filter(row => row.character_id === character)
      .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).slice(0, 5);
    return { rows, online, pending: local.filter(r => !r.synced).length, error };
  };
  return { enqueue, sync, leaderboard };
}
