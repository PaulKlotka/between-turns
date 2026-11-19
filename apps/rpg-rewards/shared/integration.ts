import type { Award, Offer } from './model';
export interface CentralContext {
  version: 1; playerId: string; displayName: string; sessionId: string;
  runId: string | null; expiresAt: number; accountId?: string | null; accountVersion?: number; photoURL?: string | null;
}
export interface RewardTransfer { id: string; sessionId: string; playerId: string; accountId: string; }
export interface RewardsView {
  inventory: Award[];
  history: Pick<Award, 'id' | 'reward' | 'playerName' | 'gameId' | 'awardedAt'>[];
  serverNow: number;
  persistent?: boolean;
}
export interface RunOffer extends Offer { runId: string }
