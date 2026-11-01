import { createHash, randomBytes } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { selectReward } from '../../shared/catalog';
import { undoUseRemaining, type Award } from '../../shared/model';
import type { CentralContext, RewardsView, RunOffer } from '../../shared/integration';
import type { Hub } from './hub';
import { fail } from './service';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return fail('invalid-argument', 'Invalid identifier.');
  return value;
}
type Connection = { nonce: string; expiresAt: number; context: CentralContext | null; connecting: boolean };
export class IntegratedRewards {
  constructor(readonly db: Firestore, readonly hub: Hub, readonly clock = Date.now, readonly random = Math.random) {}
  private async context(sessionId: string, playerId: string, runId?: string, gameId?: string) {
    const c = await this.hub.context(sessionId, playerId, runId, gameId);
    if (c.version !== 1 || c.sessionId !== sessionId || c.playerId !== playerId || (runId && c.runId !== runId) || c.expiresAt <= this.clock()) return fail('permission-denied', 'Reconnect through Between Turns.');
    return c;
  }
  async begin(nonce: unknown) {
    identifier(nonce);
    const credential = randomBytes(32).toString('base64url');
    await this.db.doc(`centralConnections/${hash(credential)}`).create({ nonce, expiresAt: this.clock() + 60000, context: null, connecting: false });
    return { credential };
  }
  async connect(credential: string, nonce: unknown, grant: unknown) {
    identifier(nonce);
    if (typeof grant !== 'string' || grant.length < 1 || grant.length > 1024) return fail('invalid-argument', 'Invalid grant.');
    const ref = this.connectionRef(credential);
    await this.db.runTransaction(async tx => {
      const c = (await tx.get(ref)).data() as Connection | undefined;
      if (!c || c.nonce !== nonce || c.expiresAt <= this.clock() || c.connecting || c.context) return fail('permission-denied', 'Start a fresh frame connection.');
      tx.update(ref, { connecting: true });
    });
    const c = await this.hub.exchange(grant, nonce as string);
    identifier(c.sessionId); identifier(c.playerId);
    if (c.version !== 1 || c.runId !== null || c.expiresAt <= this.clock()) return fail('permission-denied', 'Invalid Rewards context.');
    await this.context(c.sessionId, c.playerId);
    await ref.update({ context: c, connecting: false, expiresAt: this.clock() + 3600000 });
    return this.browser(credential, { action: 'view' });
  }
  private connectionRef(credential: string) {
    if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(credential)) return fail('unauthenticated', 'Connect through Between Turns.');
    return this.db.doc(`centralConnections/${hash(credential)}`);
  }
  private event(tx: Transaction, sessionId: string, playerId: string, key: string) {
    tx.set(this.db.doc(`rewardActivity/${hash(`${sessionId}/${key}`)}`), { sessionId, playerId, eventId: hash(key) });
  }
  private async deliver(data: { sessionId: string; playerId: string; eventId: string }) {
    try { await this.hub.activity(data.sessionId, data.playerId, data.eventId); }
    catch (error) {
      // Departure or session expiry makes this activity permanently ineligible.
      // Discard it without touching the hub; keep transient failures retryable.
      if (!['permission-denied', 'failed-precondition', 'not-found'].includes((error as { code?: string }).code || '')) throw error;
    }
  }
  async flush(sessionId?: string) {
    const collection = this.db.collection('rewardActivity');
    const events = await (sessionId ? collection.where('sessionId', '==', sessionId) : collection).limit(100).get();
    for (const event of events.docs) {
      const d = event.data();
      await this.deliver(d as { sessionId: string; playerId: string; eventId: string });
      await event.ref.delete();
    }
  }
  async browser(credential: string, input: Record<string, unknown>): Promise<RewardsView | unknown> {
    const connection = (await this.connectionRef(credential).get()).data() as Connection | undefined;
    if (!connection?.context || connection.expiresAt <= this.clock()) return fail('unauthenticated', 'Refresh to reconnect through Between Turns.');
    const c = await this.context(connection.context.sessionId, connection.context.playerId);
    const awards = this.db.collection(`centralSessions/${c.sessionId}/awards`);
    if (input.action === 'view') {
      const history = (await awards.get()).docs.map(d => d.data() as Award).sort((a, b) => b.awardedAt - a.awardedAt || a.id.localeCompare(b.id));
      return { inventory: history.filter(a => a.playerId === c.playerId), history: history.map(({ id, reward, playerName, gameId, awardedAt }) => ({ id, reward, playerName, gameId, awardedAt })), serverNow: this.clock() } satisfies RewardsView;
    }
    if (input.action !== 'consume' || typeof input.consumed !== 'boolean') return fail('invalid-argument', 'Unknown Rewards command.');
    const awardId = identifier(input.awardId), requestId = identifier(input.requestId);
    const ref = awards.doc(awardId);
    const receipt = this.db.doc(`centralPlayerReceipts/${hash(`${c.sessionId}/${c.playerId}/${requestId}`)}`);
    const fingerprint = hash(canonical({ playerId: c.playerId, ...input }));
    const result = await this.db.runTransaction(async tx => {
      const previous = await tx.get(receipt);
      if (previous.exists) {
        if (previous.get('fingerprint') !== fingerprint) return fail('already-exists', 'Request ID was reused.');
        return previous.get('result');
      }
      const award = (await tx.get(ref)).data() as Award | undefined;
      if (!award || award.playerId !== c.playerId) return fail('permission-denied', 'Only the reward owner may use it.');
      if ((award.consumedAt !== null) !== input.consumed) {
        const now = this.clock();
        const inventory = await tx.get(awards.where('playerId', '==', c.playerId));
        if (input.consumed && inventory.docs.some(d => undoUseRemaining(d.data() as Award, now) > 0)) return fail('failed-precondition', 'Wait for the 15-second undo window or undo your last use.');
        if (!input.consumed && !undoUseRemaining(award, now)) return fail('failed-precondition', 'The 15-second undo window has ended.');
        tx.update(ref, { consumedAt: input.consumed ? now : null });
        this.event(tx, c.sessionId, c.playerId, `consume/${c.playerId}/${requestId}`);
      }
      const result = { awardId, consumed: input.consumed };
      tx.create(receipt, { fingerprint, result });
      return result;
    });
    await this.flush(c.sessionId);
    return result;
  }
  async player(credential: string, input: Record<string, unknown>): Promise<RewardsView> {
    const result = await this.browser(credential, input);
    return input.action === 'view' ? result as RewardsView : await this.browser(credential, { action: 'view' }) as RewardsView;
  }
  async game(gameId: string, input: Record<string, unknown>) {
    const sessionId = identifier(input.sessionId), runId = identifier(input.runId), requestId = identifier(input.requestId);
    if (!['draw', 'settle'].includes(String(input.action))) return fail('invalid-argument', 'Use draw or settle.');
    const requestRef = this.db.doc(`centralReceipts/${hash(`${gameId}/${sessionId}/${requestId}`)}`);
    const requestFingerprint = hash(canonical(input));
    const offers = this.db.collection(`centralSessions/${sessionId}/offers`);
    // One offer per registered game and hub run, irrespective of caller request IDs.
    const offerId = hash(`${gameId}/${sessionId}/${runId}`), offerRef = offers.doc(offerId);
    if (input.action === 'draw') {
      const c = await this.context(sessionId, identifier(input.playerId), runId, gameId);
      const result = await this.db.runTransaction(async tx => {
        const receipt = await tx.get(requestRef);
        if (receipt.exists) {
          if (receipt.get('fingerprint') !== requestFingerprint) return fail('already-exists', 'Request ID was reused.');
          return receipt.get('result') as RunOffer;
        }
        const prior = await tx.get(offerRef);
        if (prior.exists) {
          const result = prior.data() as RunOffer;
          tx.create(requestRef, { fingerprint: requestFingerprint, result });
          return result;
        }
        const offer: RunOffer = { id: offerId, gameId, sessionId, runId, reward: selectReward(this.random), createdAt: this.clock() };
        tx.create(offerRef, offer);
        this.event(tx, sessionId, c.playerId, `offer/${offerId}`);
        tx.create(requestRef, { fingerprint: requestFingerprint, result: offer });
        return offer;
      });
      await this.flush(sessionId);
      return result;
    }
    if (identifier(input.offerId) !== offerId || !Array.isArray(input.winnerIds) || input.winnerIds.length > 32) return fail('invalid-argument', 'Invalid settlement.');
    const winners = input.winnerIds.map(identifier).sort();
    if (!winners.length || new Set(winners).size !== winners.length) return fail('invalid-argument', 'Unique winners are required.');
    const members = await Promise.all(winners.map(playerId => this.context(sessionId, playerId)));
    const settlementRef = this.db.doc(`centralSessions/${sessionId}/settlements/${offerId}`);
    if (!(await settlementRef.get()).exists) await Promise.all(winners.map(playerId => this.context(sessionId, playerId, runId, gameId)));
    const fingerprint = hash(JSON.stringify({ offerId, winnerIds: winners }));
    const result = await this.db.runTransaction(async tx => {
      const receiptRecord = await tx.get(requestRef);
      if (receiptRecord.exists) {
        if (receiptRecord.get('fingerprint') !== requestFingerprint) return fail('already-exists', 'Request ID was reused.');
        return receiptRecord.get('result') as { receipt: string };
      }
      const prior = await tx.get(settlementRef);
      if (prior.exists) {
        if (prior.get('fingerprint') !== fingerprint) return fail('already-exists', 'This game was settled with different winners.');
        const result = { receipt: prior.get('receipt') as string };
        tx.create(requestRef, { fingerprint: requestFingerprint, result });
        return result;
      }
      const offer = (await tx.get(offerRef)).data() as RunOffer | undefined;
      if (!offer || offer.gameId !== gameId || offer.runId !== runId) return fail('permission-denied', 'Offer does not belong to this game.');
      for (const member of members) {
        const awardId = hash(`${offerId}/${member.playerId}`);
        const award: Award = { id: awardId, offerId, gameId, playerId: member.playerId, playerName: member.displayName, reward: offer.reward, awardedAt: this.clock(), consumedAt: null };
        tx.create(this.db.doc(`centralSessions/${sessionId}/awards/${awardId}`), award);
      }
      const receipt = offerId;
      tx.create(settlementRef, { fingerprint, receipt, requestId });
      this.event(tx, sessionId, members[0].playerId, `settle/${offerId}`);
      tx.create(requestRef, { fingerprint: requestFingerprint, result: { receipt } });
      return { receipt };
    });
    await this.flush(sessionId);
    return result;
  }
  async maintain() {
    // A failed event remains durable for retry. No local session clock authorizes access.
    const events = await this.db.collection('rewardActivity').limit(100).get();
    for (const event of events.docs) {
      const d = event.data();
      try { await this.deliver(d as { sessionId: string; playerId: string; eventId: string }); await event.ref.delete(); }
      catch { /* Keep pending activity across transient hub outages. */ }
    }
    // Drain events created by the previously deployed integration adapter too.
    const legacy = await this.db.collectionGroup('activity').limit(100).get();
    for (const event of legacy.docs) {
      if (!event.ref.path.startsWith('centralSessions/')) continue;
      const d = event.data();
      try { await this.deliver(d as { sessionId: string; playerId: string; eventId: string }); await event.ref.delete(); }
      catch { /* Preserve the event across hub outages. */ }
    }
    const expired = await this.db.collection('rewardConnections').where('expiresAt', '<=', this.clock()).limit(250).get();
    if (!expired.empty) { const batch = this.db.batch(); expired.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); }
  }
}

