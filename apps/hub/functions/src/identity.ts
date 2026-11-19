import { createHash, randomBytes } from 'node:crypto';
import type { AccountProfile, ConnectionContext, Session } from '../../shared/types';
import type { Store, Transaction } from './store';
import { assert } from './errors';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
type Account = AccountProfile & { playerId: string };
type Claim = { playerId: string; expiresAt: number; accountId?: string };
const live = (s: Session | null, now: number): s is Session => !!s && s.phase !== 'closed' && s.expiresAt > now;
const valid = (s: string) => /^[A-Za-z0-9_-]{1,128}$/.test(s);

export async function accountContext(tx: Transaction, uid: string, now: number, version?: number): Promise<ConnectionContext> {
  const identity = await tx.get<Account>(`identities/${uid}`);
  const account = identity ? await tx.get<Account>(`accounts/${identity.accountId}`) : null;
  assert(account && account.playerId === uid && (version === undefined || version === account.version), 'unauthenticated', 'Sign in again to view your rewards.');
  return { version: 1, playerId: uid, displayName: account.displayName, photoURL: account.photoURL, accountId: account.accountId, accountVersion: account.version, sessionId: '', runId: null, expiresAt: now + 3600000 };
}

export class Identities {
  constructor(readonly store: Store, readonly now = Date.now) {}
  async resolve(uid: string, googleId?: string) {
    assert(valid(uid) && (!googleId || valid(googleId)), 'unauthenticated', 'Invalid identity.');
    return this.store.transaction(async tx => {
      if (googleId) {
        const account = await tx.get<Account>(`accounts/${googleId}`);
        assert(account, 'failed-precondition', 'Finish signing in to your account.');
        return account.playerId;
      }
      assert(!(await tx.get<Account>(`identities/${uid}`))?.accountId, 'unauthenticated', 'This guest has signed in. Refresh to continue.');
      return uid;
    });
  }
  async prepare(uid: string) {
    return this.store.transaction(async tx => {
      assert(!(await tx.get<Account>(`identities/${uid}`))?.accountId, 'failed-precondition', 'Already signed in.');
      const token = randomBytes(32).toString('base64url'), expiresAt = this.now() + 600000;
      tx.set(`identityClaims/${hash(token)}`, { playerId: uid, expiresAt });
      return { token, expiresAt };
    });
  }
  private async detach(tx: Transaction, playerId: string) {
    const pointer = await tx.get<{ sessionId: string | null }>(`players/${playerId}`);
    const s = pointer?.sessionId ? await tx.get<Session>(`sessions/${pointer.sessionId}`) : null;
    if (s?.members[playerId]) {
      delete s.members[playerId];
      if (s.ballot) { s.ballot.eligible = s.ballot.eligible.filter(p => p !== playerId); delete s.ballot.votes[playerId]; }
      if (!Object.keys(s.members).length) s.phase = 'closed';
      s.revision++; tx.set(`sessions/${s.id}`, s);
    }
    tx.set(`players/${playerId}`, { sessionId: null });
  }
  // profile is constructed exclusively from the Admin SDK's Google provider record.
  async signIn(uid: string, profile: Omit<AccountProfile, 'version'>, claim?: string) {
    assert(valid(uid) && valid(profile.accountId) && profile.displayName.trim().length > 0, 'failed-precondition', 'Your Google account needs a display name.');
    assert(!claim || /^[A-Za-z0-9_-]{43}$/.test(claim), 'invalid-argument', 'Invalid sign-in claim.');
    return this.store.transaction(async tx => {
      const now = this.now(), accountPath = `accounts/${profile.accountId}`;
      const previous = await tx.get<Account>(accountPath);
      let playerId = previous?.playerId ?? uid;
      let source: Claim | null = null;
      if (claim) {
        source = await tx.get<Claim>(`identityClaims/${hash(claim)}`);
        assert(source && source.expiresAt > now && (!source.accountId || source.accountId === profile.accountId), 'permission-denied', 'The sign-in transfer expired. Try signing in again.');
        const owner = await tx.get<Account>(`identities/${source.playerId}`);
        assert(!owner || owner.accountId === profile.accountId, 'permission-denied', 'This guest already belongs to another account.');
        const pointer = await tx.get<{ sessionId: string | null }>(`players/${source.playerId}`);
        const s = pointer?.sessionId ? await tx.get<Session>(`sessions/${pointer.sessionId}`) : null;
        if (live(s, now) && s.members[source.playerId]) {
          playerId = source.playerId;
          const transferId = hash(`${s.id}/${playerId}`);
          // Durable outbox: Rewards acknowledges only after ownership is transferred.
          tx.set(`rewardTransfers/${transferId}`, { id: transferId, sessionId: s.id, playerId, accountId: profile.accountId });
        }
        tx.set(`identityClaims/${hash(claim)}`, { ...source, accountId: profile.accountId });
      }
      const account: Account = { ...profile, version: previous?.version ?? 1, playerId };
      if (previous && previous.playerId !== playerId) await this.detach(tx, previous.playerId);
      if (source) tx.set(`identities/${source.playerId}`, account);
      tx.set(`identities/${playerId}`, account); tx.set(accountPath, account);
      const pointer = await tx.get<{ sessionId: string | null }>(`players/${playerId}`);
      const s = pointer?.sessionId ? await tx.get<Session>(`sessions/${pointer.sessionId}`) : null;
      if (live(s, now) && s.members[playerId]) {
        Object.assign(s.members[playerId], { name: profile.displayName, nameKey: profile.displayName.normalize('NFKC').toLocaleLowerCase('en-US'), photoURL: profile.photoURL });
        s.revision++; tx.set(`sessions/${s.id}`, s);
      }
      return { playerId, displayName: profile.displayName, photoURL: profile.photoURL };
    });
  }
  async signOut(playerId: string) {
    await this.store.transaction(async tx => {
      const identity = await tx.get<Account>(`identities/${playerId}`);
      const account = identity ? await tx.get<Account>(`accounts/${identity.accountId}`) : null;
      await this.detach(tx, playerId);
      if (account) tx.set(`accounts/${account.accountId}`, { ...account, version: account.version + 1 });
    });
  }
}
