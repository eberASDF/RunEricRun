import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScoreGateway } from './scoreStore';
import { ensureAnonymousSession } from '../../shared/authSession.js';

export function createSupabaseGateway(client: SupabaseClient): ScoreGateway {
  const session = () => ensureAnonymousSession(client);
  return {
    async insert(row) {
      await session();
      const { error } = await client.from('runs').insert({ id: row.id, character_id: row.character_id, score: row.score, created_at: row.created_at });
      if (!error) return;
      if (error.code !== '23505') throw error;
      const existing = await client.from('runs').select('id').eq('id', row.id)
        .eq('character_id', row.character_id).eq('score', row.score).maybeSingle();
      if (existing.error || !existing.data) throw existing.error || error;
    },
    async top(character) {
      await session();
      const result = await client.from('runs').select('id,character_id,score,created_at').eq('character_id', character)
        .order('score', { ascending: false }).order('created_at', { ascending: true }).order('id', { ascending: true }).limit(5);
      if (result.error) throw result.error;
      return (result.data || []) as Awaited<ReturnType<ScoreGateway['top']>>;
    },
  };
}
