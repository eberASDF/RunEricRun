import type { GameSession } from './sessionClient.js';
export type ControlState = { connected: boolean; ready: boolean; status: 'unpaired' | 'connecting' | 'waiting' | 'idle' | 'connected' };
export type JumpControl = {
  snapshot(): ControlState;
  subscribe(fn: (state: ControlState) => void): () => void;
  setSession(session: GameSession | null, enabled?: boolean): Promise<void>;
  disconnect(): Promise<void>;
  setGame(game: { runId: string; active: boolean } | null, receiver?: ((expiresAt: number) => void) | null): void;
  sendJump(): Promise<boolean>;
};
export function createJumpControl(options: { client: unknown; role: 'phone' | 'watch'; uuid?: () => string }): JumpControl;
export function commandId(): string;
export function controlTopic(session: GameSession | null): string | null;
