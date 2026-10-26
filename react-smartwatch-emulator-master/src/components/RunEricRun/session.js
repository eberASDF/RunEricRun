import { createClient } from '@supabase/supabase-js';
import { createSessionLink } from '../../../../shared/sessionClient.js';
import { withoutBroadcastHttp } from '../../../../shared/broadcastFetch.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  global: { fetch: withoutBroadcastHttp((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) })) },
}) : null;
export function watchLink() {
  return createSessionLink({ client, role: 'watch', storage: {
    getItem: async key => localStorage.getItem(key),
    setItem: async (key, value) => { localStorage.setItem(key, value); },
    removeItem: async key => { localStorage.removeItem(key); },
  } });
}
