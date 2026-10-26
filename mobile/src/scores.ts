import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createClient } from '@supabase/supabase-js';
import { createScoreStore } from './scoreStore';
import { createSupabaseGateway } from './supabaseGateway';
import type { CharacterId } from './characterIds';
import { withoutBroadcastHttp } from '../../shared/broadcastFetch.js';
export type { ScoreRecord } from './scoreStore';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const client = configured ? createClient(url!, key!, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: withoutBroadcastHttp((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) })) },
}) : null;
const store = createScoreStore(AsyncStorage, client ? createSupabaseGateway(client) : null);
export const leaderboard = store.leaderboard;
export function setAuthActive(active: boolean) {
  if (active) client?.auth.startAutoRefresh(); else client?.auth.stopAutoRefresh();
}
export async function saveRun(score: number, id = Crypto.randomUUID(), character: CharacterId = 'eric') {
  await store.enqueue({ id, character_id: character, score, created_at: new Date().toISOString() });
}
