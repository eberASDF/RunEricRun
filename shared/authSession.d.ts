export function ensureAnonymousSession(client: unknown): Promise<{ access_token: string; user: { id: string } }>;
