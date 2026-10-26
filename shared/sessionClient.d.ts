export type CharacterId = 'eric' | 'harvey' | 'eber';
export type GameSession = { id: string; owner_id: string; watch_user_id: string | null;
  selected_character: CharacterId; revision: number; updated_at: string };
export type LinkState = { session: GameSession | null; status: 'idle' | 'connecting' | 'online' | 'offline' | 'unpaired'; error: string | null };
export type PairCode = { code: string; session_id: string; expires_at: string };
export type SessionLink = {
  snapshot(): LinkState;
  subscribe(fn: (state: LinkState) => void): () => void;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  createPairCode(): Promise<PairCode>;
  pair(code: string): Promise<GameSession>;
  selectCharacter(character: CharacterId): Promise<GameSession>;
  unlink(): Promise<void>;
};
export function createSessionLink(options: { client: unknown; role: 'phone' | 'watch'; storage: {
  getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void>;
} }): SessionLink;
