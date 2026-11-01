import type { Award, Offer } from './model';
export interface CentralContext {
  version: 1; playerId: string; displayName: string; sessionId: string;
  runId: string | null; expiresAt: number;
}
export interface RewardsView {
  inventory: Award[];
  history: Pick<Award, 'id' | 'reward' | 'playerName' | 'gameId' | 'awardedAt'>[];
  serverNow: number;
}
export interface RunOffer extends Offer { runId: string }
