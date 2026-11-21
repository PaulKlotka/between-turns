import type { RewardListReference } from './reward-lists';
export const VERSION = 1 as const;
export const SESSION_TTL = 24 * 60 * 60 * 1000;
export const PRESENCE_TTL = 60_000;
export const VOTE_DURATION = 30_000;
export const MAX_MEMBERS = 32;

export interface Game { id: string; name: string; description: string; ready: boolean; embedUrl?: string; }
export const GAMES: Game[] = [{ id: 'rpg-bingo', name: 'Bingo', description: 'Every roll brings you closer. Match numbers, complete a pattern, and earn a little extra luck.', ready: false }];
export interface Member { id: string; name: string; nameKey: string; photoURL?: string | null; joinedAt: number; connections: Record<string, number>; }
export interface AccountProfile { accountId: string; displayName: string; photoURL: string | null; version: number; }
export interface RewardTransfer { id: string; sessionId: string; playerId: string; accountId: string; }
export interface Ballot { id: string; options: string[]; eligible: string[]; votes: Record<string, string>; openedAt: number; closesAt: number; }
export interface Run { rewardList?: RewardListReference; id: string; gameId: string; startedAt: number; }
export interface Result { runId: string; gameId: string; completedAt: number; winnerIds: string[]; }
export interface Session {
  selectedRewardList?: RewardListReference;
  id: string; code: string; createdAt: number; activityAt: number; expiresAt: number;
  phase: 'lobby' | 'voting' | 'playing' | 'closed'; members: Record<string, Member>;
  ballot: Ballot | null; run: Run | null; history: Result[]; revision: number;
}
export interface SessionView {
  session: Omit<Session, 'members'> & { members: { id: string; name: string; photoURL?: string | null; connected: boolean }[] };
  playerId: string; expired: boolean; serverNow: number; games: Game[];
  rewardsApp: { id: string; embedUrl: string } | null;
}
export type PlayerCommand =
  | { action: 'current' }
  | { action: 'create'; name?: string; requestId: string }
  | { action: 'join'; code: string; name?: string; requestId: string }
  | { action: 'prepareSignIn' }
  | { action: 'identity'; claim?: string }
  | { action: 'signOut' }
  | { action: 'accountConnect'; appId: string; nonce: string }
  | { action: 'leave'; sessionId: string; requestId: string }
  | { action: 'presence'; sessionId: string; connectionId: string; connected: boolean }
  | { action: 'start'; sessionId: string; requestId: string }
  | { action: 'vote'; sessionId: string; ballotId: string; gameId: string; requestId: string }
  | { action: 'connect'; sessionId: string; appId: string; runId?: string; nonce: string };
export interface Grant { token: string; expiresAt: number; }
export type PlayerResponse = SessionView | Grant | null;
export interface ConnectionContext { selectedRewardList?: RewardListReference; rewardList?: RewardListReference; version: 1; playerId: string; displayName: string; photoURL?: string | null; accountId?: string | null; accountVersion?: number; sessionId: string; runId: string | null; expiresAt: number; memberCount?: number; connectedCount?: number; members?: { id: string; name: string; connected: boolean }[]; }
export type GameCommand =
  | { action: 'rewardSessionStatus'; sessionId: string }
  | { action: 'selectRewardList'; sessionId: string; playerId: string; accountId: string | null; eventId: string; rewardList: RewardListReference }
  | { action: 'rewardTransfers'; accountId?: string }
  | { action: 'ackRewardTransfer'; transferId: string }
  | { action: 'accountContext'; playerId: string; accountVersion: number }
  | { action: 'exchange'; token: string; nonce: string }
  | { action: 'context'; sessionId: string; playerId: string; runId?: string; gameId?: string }
  | { action: 'activity'; sessionId: string; playerId: string; runId?: string; eventId: string }
  | { action: 'complete'; sessionId: string; runId: string; eventId: string; winnerIds: string[]; rewardsReceipt: string };
