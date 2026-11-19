import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Identities } from '../../functions/src/identity';
import { HubService } from '../../functions/src/service';
import { MemoryStore } from '../helpers';
import type { ConnectionContext, Grant, SessionView } from '../../shared/types';

function fixture() {
  const store = new MemoryStore(); let now = 1000;
  const identities = new Identities(store, () => now);
  const hub = new HubService(store, [], [{ id: 'rewards', kind: 'rewards', origin: 'https://rewards.example' }, { id: 'bingo', kind: 'game', origin: 'https://bingo.example' }], () => now);
  const profile = { accountId: 'google-123', displayName: 'Google Player', photoURL: 'https://lh3.googleusercontent.com/photo' };
  const create = async (id: string) => hub.player(id, { action: 'create', name: id, requestId: `create-${id}` }) as Promise<SessionView>;
  return { store, identities, hub, profile, create, advance: (ms: number) => { now += ms; } };
}
test('Google sign-in keeps guest member IDs, uses provider profile and queues one durable transfer', async () => {
  const f = fixture(); const before = await f.create('guest');
  const claim = await f.identities.prepare('guest');
  await f.identities.signIn('guest', f.profile, claim.token);
  await f.identities.signIn('guest', f.profile, claim.token);
  const after = await f.hub.player(await f.identities.resolve('guest', f.profile.accountId), { action: 'current' }) as SessionView;
  assert.equal(after.playerId, 'guest'); assert.equal(after.session.id, before.session.id);
  assert.equal(after.session.members[0].name, f.profile.displayName); assert.equal(after.session.members[0].photoURL, f.profile.photoURL);
  assert.equal(after.session.expiresAt, before.session.expiresAt);
  assert.equal([...f.store.data.keys()].filter(p => p.startsWith('rewardTransfers/')).length, 1);
  await assert.rejects(f.identities.resolve('guest'), /signed in/);
});
test('existing account absorbs a new guest without rekeying the game; former membership is removed', async () => {
  const f = fixture(); await f.create('account-user');
  await f.identities.signIn('account-user', f.profile);
  const guest = await f.create('guest'); const claim = await f.identities.prepare('guest');
  await f.identities.signIn('account-user', f.profile, claim.token);
  assert.equal(await f.identities.resolve('account-user', f.profile.accountId), 'guest');
  assert.equal((await f.hub.player('guest', { action: 'current' }) as SessionView).session.id, guest.session.id);
  assert.equal(await f.hub.player('account-user', { action: 'current' }), null);
  await assert.rejects(f.identities.signIn('attacker', { ...f.profile, accountId: 'other-google' }, claim.token), /expired|another account/);
});
test('expired claims fail and expired sessions cannot transfer rewards', async () => {
  const f = fixture(); await f.create('guest'); const claim = await f.identities.prepare('guest');
  f.advance(600001); await assert.rejects(f.identities.signIn('guest', f.profile, claim.token), /expired/);
  f.advance(86400000); const fresh = await f.identities.prepare('guest');
  await f.identities.signIn('guest', f.profile, fresh.token);
  assert.equal([...f.store.data.keys()].filter(p => p.startsWith('rewardTransfers/')).length, 0);
});
test('account names need no input and matching Google names may join the same session', async () => {
  const f = fixture(); await f.identities.signIn('a', f.profile);
  await f.identities.signIn('b', { ...f.profile, accountId: 'google-456' });
  const first = await f.hub.player('a', { action: 'create', requestId: 'new' }) as SessionView;
  const joined = await f.hub.player('b', { action: 'join', code: first.session.code, requestId: 'join' }) as SessionView;
  assert.deepEqual(joined.session.members.map(m => m.name), [f.profile.displayName, f.profile.displayName]);
});
test('wallet grants work without a session and are app scoped, single-use and revoked on sign out', async () => {
  const f = fixture(); await f.identities.signIn('user', f.profile);
  const grant = await f.hub.player('user', { action: 'accountConnect', appId: 'rewards', nonce: 'nonce' }) as Grant;
  await assert.rejects(f.hub.game('bingo', { action: 'exchange', token: grant.token, nonce: 'nonce' }));
  const c = await f.hub.game('rewards', { action: 'exchange', token: grant.token, nonce: 'nonce' }) as ConnectionContext;
  assert.equal(c.sessionId, ''); assert.equal(c.accountId, f.profile.accountId);
  await assert.rejects(f.hub.game('rewards', { action: 'exchange', token: grant.token, nonce: 'nonce' }));
  await f.identities.signOut('user');
  await assert.rejects(f.hub.game('rewards', { action: 'accountContext', playerId: 'user', accountVersion: c.accountVersion! }), /Sign in again/);
  await assert.rejects(f.hub.player('guest', { action: 'accountConnect', appId: 'rewards', nonce: 'nonce' }));
});
test('a guest handoff issued before sign-in cannot expose account inventory afterward', async () => {
  const f = fixture(); const v = await f.create('guest');
  const grant = await f.hub.player('guest', { action: 'connect', appId: 'rewards', sessionId: v.session.id, nonce: 'nonce' }) as Grant;
  const claim = await f.identities.prepare('guest'); await f.identities.signIn('guest', f.profile, claim.token);
  await assert.rejects(f.hub.game('rewards', { action: 'exchange', token: grant.token, nonce: 'nonce' }), /Identity changed/);
});
