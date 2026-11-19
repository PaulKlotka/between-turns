import { GoogleAuth } from 'google-auth-library';
import type { CentralContext, RewardTransfer } from '../../shared/integration';
import { fail } from './service';

export interface Hub {
  accountContext?(playerId: string, accountVersion: number): Promise<CentralContext>;
  transfers?(accountId?: string): Promise<RewardTransfer[]>;
  ackTransfer?(id: string): Promise<unknown>;
  exchange(token: string, nonce: string): Promise<CentralContext>;
  context(sessionId: string, playerId: string, runId?: string, gameId?: string): Promise<CentralContext>;
  activity(sessionId: string, playerId: string, eventId: string): Promise<unknown>;
}
export class RemoteHub implements Hub {
  accountContext(playerId: string, accountVersion: number) { return this.request<CentralContext>({ action: 'accountContext', playerId, accountVersion }); }
  transfers(accountId?: string) { return this.request<RewardTransfer[]>({ action: 'rewardTransfers', ...(accountId ? { accountId } : {}) }); }
  ackTransfer(transferId: string) { return this.request({ action: 'ackRewardTransfer', transferId }); }
  private auth = new GoogleAuth();
  private async request<T>(data: object): Promise<T> {
    const url = process.env.BETWEEN_TURNS_API_URL;
    if (!url) return fail('failed-precondition', 'Between Turns is not configured.');
    const local = process.env.FUNCTIONS_EMULATOR === 'true';
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(local && ['127.0.0.1', 'localhost'].includes(parsed.hostname))) return fail('failed-precondition', 'The hub endpoint must use HTTPS.');
    let body: { result: T; error?: { code: string; message: string } };
    if (local) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emulator-App': 'rpg-rewards' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
      body = await response.json() as typeof body;
    } else {
      const client = await this.auth.getIdTokenClient(url);
      try { body = (await client.request<typeof body>({ url, method: 'POST', data, timeout: 15000 })).data; }
      catch (error) {
        const remote = (error as { response?: { data?: typeof body } }).response?.data;
        if (!remote?.error) throw error;
        body = remote;
      }
    }
    if (body.error) {
      const code = body.error.code;
      if (['permission-denied', 'unauthenticated', 'failed-precondition', 'not-found'].includes(code)) return fail(code as 'permission-denied', body.error.message);
      throw new Error('Between Turns could not complete the request.');
    }
    if (!body.result) throw new Error('Invalid hub response.');
    return body.result;
  }
  exchange(token: string, nonce: string) { return this.request<CentralContext>({ action: 'exchange', token, nonce }); }
  context(sessionId: string, playerId: string, runId?: string, gameId?: string) { return this.request<CentralContext>({ action: 'context', sessionId, playerId, ...(runId ? { runId, gameId } : {}) }); }
  activity(sessionId: string, playerId: string, eventId: string) { return this.request({ action: 'activity', sessionId, playerId, eventId }); }
}
