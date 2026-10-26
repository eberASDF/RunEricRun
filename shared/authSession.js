const signingIn = new WeakMap();
export function ensureAnonymousSession(client) {
  if (signingIn.has(client)) return signingIn.get(client);
  const promise = (async () => {
    const existing = await client.auth.getSession();
    if (existing.error) throw existing.error;
    if (existing.data.session) return existing.data.session;
    const result = await client.auth.signInAnonymously();
    if (result.error) throw result.error;
    if (!result.data.session) throw new Error('No se pudo crear la sesión anónima.');
    return result.data.session;
  })().finally(() => signingIn.delete(client));
  signingIn.set(client, promise);
  return promise;
}
