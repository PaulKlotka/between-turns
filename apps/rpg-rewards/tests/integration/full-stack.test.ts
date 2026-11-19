import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { HubService } from '../../../../apps/hub/functions/src/service';
import { Identities } from '../../../../apps/hub/functions/src/identity';
import { FirestoreStore } from '../../../../apps/hub/functions/src/store';
import type { GameCommand, SessionView, Grant } from '../../../../apps/hub/shared/types';
import { IntegratedRewards as CentralRewards } from '../../functions/src/integrated-service';
import type { Hub as HubGateway } from '../../functions/src/hub';
import type { CentralContext as HubContext } from '../../shared/integration';
import { EmbeddedService } from '../../../../games/rpg-bingo/functions/src/embedded-service';
import type { IntegrationGateway } from '../../../../games/rpg-bingo/functions/src/integration-gateway';
import type { CentralContext, RewardOffer, EmbeddedRun } from '../../../../games/rpg-bingo/functions/src/shared/embedded';

if (!process.env.FIRESTORE_EMULATOR_HOST?.match(/^(127\.0\.0\.1|localhost):\d+$/)) throw new Error('Use a local Firestore emulator.');
const hubRequire = createRequire(new URL('../../../../apps/hub/functions/package.json', import.meta.url));
const bingoRequire = createRequire(new URL('../../../../games/rpg-bingo/functions/package.json', import.meta.url));
const rewardRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const hubApp = hubRequire('firebase-admin/app').initializeApp({ projectId: 'demo-between-turns' });
const bingoApp = bingoRequire('firebase-admin/app').initializeApp({ projectId: 'demo-between-turns' }, 'full-stack');
const rewardApp = rewardRequire('firebase-admin/app').initializeApp({ projectId: 'demo-between-turns' }, 'full-stack');
const bingoDb = bingoRequire('firebase-admin/firestore').getFirestore(bingoApp, 'rpg-bingo');
const hubDb = hubRequire('firebase-admin/firestore').getFirestore(hubApp);
const rewardDb = rewardRequire('firebase-admin/firestore').getFirestore(rewardApp, 'rpg-rewards');
after(async () => { await Promise.all([hubRequire('firebase-admin/app').deleteApp(hubApp), bingoRequire('firebase-admin/app').deleteApp(bingoApp), rewardRequire('firebase-admin/app').deleteApp(rewardApp)]); });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  let now = 1000; const prefix = randomUUID(); const a = `a-${prefix}`; const b = `b-${prefix}`;
  const hub = new HubService(new FirestoreStore(), [{ id: 'rpg-bingo', name: 'Bingo', description: 'Bingo', ready: true, embedUrl: 'https://bingo.example/embed' }], [
    { id: 'rpg-bingo', kind: 'game', origin: 'https://bingo.example' }, { id: 'rpg-rewards', kind: 'rewards', origin: 'https://rewards.example', embedUrl: 'https://rewards.example/embed' },
  ], () => now);
  const rh: HubGateway = {
    accountContext: async (playerId, accountVersion) => hub.game('rpg-rewards', { action: 'accountContext', playerId, accountVersion }) as Promise<HubContext>,
    transfers: async accountId => {
      const jobs = hubDb.collection('rewardTransfers');
      return (await (accountId ? jobs.where('accountId', '==', accountId) : jobs).get()).docs.map((d: any) => d.data());
    },
    ackTransfer: async id => hubDb.doc(`rewardTransfers/${id}`).delete(),
    exchange: async (token, nonce) => hub.game('rpg-rewards', { action: 'exchange', token, nonce }) as Promise<HubContext>,
    context: async (sessionId, playerId, runId, gameId) => hub.game('rpg-rewards', { action: 'context', sessionId, playerId, ...(runId ? { runId, gameId } : {}) }) as Promise<HubContext>,
    activity: async (sessionId, playerId, eventId) => hub.game('rpg-rewards', { action: 'activity', sessionId, playerId, eventId }),
  };
  const rewards = new CentralRewards(rewardDb, rh, () => now);
  let loseSettlement = false;
  const gateway: IntegrationGateway = {
    exchange: async (token, nonce) => hub.game('rpg-bingo', { action: 'exchange', token, nonce }) as Promise<CentralContext>,
    context: async c => hub.game('rpg-bingo', { action: 'context', sessionId: c.sessionId, playerId: c.playerId, runId: c.runId }) as Promise<CentralContext>,
    activity: async (c, eventId) => hub.game('rpg-bingo', { action: 'activity', sessionId: c.sessionId, playerId: c.playerId, runId: c.runId, eventId }),
    draw: async c => rewards.game('rpg-bingo', { action: 'draw', sessionId: c.sessionId, playerId: c.playerId, runId: c.runId, requestId: hash(`offer/${c.playerId}/${c.runId}`) }) as Promise<RewardOffer>,
    settle: async (c, offerId, winnerIds) => {
      const result = await rewards.game('rpg-bingo', { action: 'settle', sessionId: c.sessionId, runId: c.runId, offerId, winnerIds, requestId: hash(`settle/${c.runId}`) });
      if (loseSettlement) { loseSettlement = false; throw new Error('Lost response after committed Rewards settlement'); }
      return result as { receipt: string };
    },
    complete: async (c, eventId, winnerIds, rewardsReceipt) => hub.game('rpg-bingo', { action: 'complete', sessionId: c.sessionId, runId: c.runId, eventId, winnerIds, rewardsReceipt }),
  };
  const bingo = new EmbeddedService(bingoDb, gateway, () => now);
  const first = await hub.player(a, { action: 'create', name: 'Alpha', requestId: randomUUID() }) as SessionView;
  const sessionId = first.session.id;
  await hub.player(b, { action: 'join', code: first.session.code, name: 'Beta', requestId: randomUUID() });
  await hub.player(a, { action: 'start', sessionId, requestId: randomUUID() });
  const current = await hub.player(a, { action: 'current' }) as SessionView; const runId = current.session.run!.id;
  async function connect(playerId: string, appId: string) {
    const nonce = randomUUID(); const service = appId === 'rpg-bingo' ? bingo : rewards;
    const { credential } = await service.begin(nonce);
    const grant = await hub.player(playerId, { action: 'connect', sessionId, appId, nonce, ...(appId === 'rpg-bingo' ? { runId } : {}) }) as Grant;
    await service.connect(credential, nonce, grant.token); return credential;
  }
  const ac = await connect(a, 'rpg-bingo'); const bc = await connect(b, 'rpg-bingo');
  const ar = await connect(a, 'rpg-rewards'); const br = await connect(b, 'rpg-rewards');
  const ref = bingoDb.doc(`embeddedRuns/${hash(`${sessionId}/${runId}`)}`);
  const run = (await ref.get()).data() as EmbeddedRun;
  const card = Array.from({ length: 25 }, (_, i) => i === 12 ? null : i % 20 + 1);
  await ref.update({ pattern: 'single-line', marks: [1, 2, 3, 4], players: Object.fromEntries(Object.entries(run.players).map(([id, p]) => [id, { ...p, card }])) });
  async function wallet(playerId: string) {
    const nonce = randomUUID(), { credential } = await rewards.begin(nonce);
    const grant = await hub.player(playerId, { action: 'accountConnect', appId: 'rpg-rewards', nonce }) as Grant;
    await rewards.connect(credential, nonce, grant.token); return credential;
  }
  return { hub, rewards, bingo, gateway, rh, wallet, connect, identities: new Identities(new FirestoreStore(), () => now), a, b, ac, bc, ar, br, ref, sessionId, runId, advance: (value: number) => { now = value; }, lose: () => { loseSettlement = true; }, now: () => now };
}

test('Google sign-in transfers existing awards in place into an existing account and survives session deletion', async () => {
  const f = await fixture(); const start = await f.bingo.command(f.ac, { action: 'view' });
  await f.rewards.game('rpg-bingo', { action: 'settle', sessionId: f.sessionId, runId: f.runId, offerId: start.offer!.id, winnerIds: [f.a, f.b], requestId: 'before-login' });
  const before = await f.rewards.player(f.ar, { action: 'view' }); const award = before.inventory[0];
  await f.rewards.player(f.ar, { action: 'consume', awardId: award.id, consumed: true, requestId: 'guest-use' });
  const profile = { accountId: `google-${f.a}`, displayName: 'Google Alpha', photoURL: 'https://lh3.googleusercontent.com/alpha' };
  const firebaseUid = `existing-${f.a}`;
  await f.identities.signIn(firebaseUid, profile);
  const oldRef = rewardDb.doc(`centralSessions/old-${f.sessionId}/awards/previous`);
  await oldRef.set({ ...award, id: 'previous', accountId: profile.accountId, consumedAt: null });
  const originalPath = `centralSessions/${f.sessionId}/awards/${award.id}`;
  const claim = await f.identities.prepare(f.a);
  await f.identities.signIn(firebaseUid, profile, claim.token);
  await f.identities.signIn(firebaseUid, profile, claim.token);
  assert.equal(await f.identities.resolve(firebaseUid, profile.accountId), f.a);
  await assert.rejects(f.bingo.command(f.ac, { action: 'view' }), /Identity changed/);
  await assert.rejects(f.rewards.player(f.ar, { action: 'view' }), /Identity changed/);
  const card = start.card; const updated = await f.connect(f.a, 'rpg-bingo');
  const game = await f.bingo.command(updated, { action: 'view' });
  assert.deepEqual(game.card, card); assert.equal(game.players.find(p => p.playerId === f.a)?.name, profile.displayName);
  assert.equal(game.players.find(p => p.playerId === f.a)?.photoURL, profile.photoURL);
  const wallet = await f.wallet(f.a); const saved = await f.rewards.player(wallet, { action: 'view' });
  assert.equal(saved.inventory.length, 2); assert.equal(saved.persistent, true);
  const transferred = saved.inventory.find(a => a.id === award.id)!;
  assert.equal(transferred.consumedAt, f.now());
  assert.equal((await rewardDb.doc(originalPath).get()).get('accountId'), profile.accountId);
  assert.equal((await rewardDb.collection(`centralSessions/${f.sessionId}/awards`).get()).size, 2);
  await f.rewards.player(wallet, { action: 'consume', awardId: award.id, consumed: false, requestId: 'account-undo' });
  await f.rewards.syncTransfers(profile.accountId); // Replayed delivery cannot copy awards.
  const otherProfile = { ...profile, accountId: `other-${f.a}` };
  await f.identities.signIn(`other-user-${f.a}`, otherProfile);
  const otherWallet = await f.wallet(`other-user-${f.a}`);
  await assert.rejects(f.rewards.player(otherWallet, { action: 'consume', awardId: award.id, consumed: true, requestId: 'steal' }), /reward owner/);
  f.advance(86401001); await hubDb.doc(`sessions/${f.sessionId}`).delete();
  const returningWallet = await f.wallet(await f.identities.resolve(firebaseUid, profile.accountId));
  assert.equal((await f.rewards.player(returningWallet, { action: 'view' })).inventory.length, 2);
  await f.rewards.player(returningWallet, { action: 'consume', awardId: award.id, consumed: true, requestId: 'after-session' });
  await f.identities.signOut(f.a);
  await assert.rejects(f.rewards.player(returningWallet, { action: 'view' }), /Sign in again/);
});

test('concurrent transfer and settlement preserve award IDs and permanent ownership across retries', async () => {
  const f = await fixture(); const run = await f.bingo.command(f.ac, { action: 'view' });
  const profile = { accountId: `google-${f.a}`, displayName: 'Google Alpha', photoURL: null };
  const claim = await f.identities.prepare(f.a); await f.identities.signIn(f.a, profile, claim.token);
  const jobs = await f.rh.transfers!(profile.accountId); assert.equal(jobs.length, 1);
  const settle = { action: 'settle', sessionId: f.sessionId, runId: f.runId, offerId: run.offer!.id, winnerIds: [f.a], requestId: 'racing-settle' };
  await Promise.all([f.rewards.transfer(jobs[0]), f.rewards.game('rpg-bingo', settle), f.rewards.transfer(jobs[0]), f.rewards.game('rpg-bingo', settle)]);
  await f.rewards.transfer(jobs[0]);
  const awards = await rewardDb.collection(`centralSessions/${f.sessionId}/awards`).get();
  assert.equal(awards.size, 1); assert.equal(awards.docs[0].get('accountId'), profile.accountId);
  assert.equal(awards.docs[0].get('playerName'), profile.displayName);
  const wallet = await f.wallet(f.a);
  assert.equal((await f.rewards.player(wallet, { action: 'view' })).inventory.length, 1);
});

test('durable transfer recovers after the session disappears and a lost acknowledgement', async () => {
  const f = await fixture(); const run = await f.bingo.command(f.ac, { action: 'view' });
  await f.rewards.game('rpg-bingo', { action: 'settle', sessionId: f.sessionId, runId: f.runId, offerId: run.offer!.id, winnerIds: [f.a], requestId: 'deferred-award' });
  const original = (await f.rewards.player(f.ar, { action: 'view' })).inventory[0];
  const profile = { accountId: `deferred-${f.a}`, displayName: 'Google Alpha', photoURL: null };
  const claim = await f.identities.prepare(f.a); await f.identities.signIn(f.a, profile, claim.token);
  f.advance(86401001); await hubDb.doc(`sessions/${f.sessionId}`).delete();
  const failing = new CentralRewards(rewardDb, { ...f.rh, ackTransfer: async () => { throw new Error('Lost acknowledgement'); } }, f.now);
  await assert.rejects(failing.syncTransfers(profile.accountId), /Lost acknowledgement/);
  assert.equal((await f.rh.transfers!(profile.accountId)).length, 1);
  await f.rewards.syncTransfers(profile.accountId);
  assert.equal((await f.rh.transfers!(profile.accountId)).length, 0);
  const wallet = await f.wallet(f.a), saved = await f.rewards.player(wallet, { action: 'view' });
  assert.equal(saved.inventory.length, 1); assert.equal(saved.inventory[0].id, original.id);
  const collection = await rewardDb.collection(`centralSessions/${f.sessionId}/awards`).get(); assert.equal(collection.size, 1);
});
test('real hub, Bingo and Rewards complete a tied game, recover settlement, start a new run and preserve inventory', async () => {
  const f = await fixture();
  const start = await f.bingo.command(f.ac, { action: 'view' });
  const won = await f.bingo.command(f.ac, { action: 'roll', kind: 'physical', number: 5, requestId: 'win', revision: start.revision });
  assert.equal(won.phase, 'review'); assert.deepEqual(new Set(won.winners), new Set([f.a, f.b]));
  f.advance(15000);
  await f.bingo.command(f.ac, { action: 'undo', requestId: 'undo', revision: won.revision });
  const undone = await f.bingo.command(f.bc, { action: 'view' }); assert.equal(undone.phase, 'playing');
  await f.bingo.command(f.bc, { action: 'roll', kind: 'physical', number: 5, requestId: 'win-again', revision: undone.revision });
  f.advance(30000); f.lose();
  const c: CentralContext = { version: 1, playerId: f.a, displayName: 'Alpha', sessionId: f.sessionId, runId: f.runId, expiresAt: 0 };
  await assert.rejects(f.bingo.progress(c), /Lost response/);
  const restarted = new EmbeddedService(bingoDb, f.gateway, f.now); await restarted.progress(c);
  const next = await f.hub.player(f.a, { action: 'current' }) as SessionView;
  assert.notEqual(next.session.run!.id, f.runId); assert.equal(next.session.history.length, 1);
  const inventory = await f.rewards.player(f.ar, { action: 'view' });
  assert.equal(inventory.inventory.length, 1); assert.equal(inventory.history.length, 2);
  assert.deepEqual(inventory.inventory[0].reward, start.offer!.reward);
  const awardId = inventory.inventory[0].id;
  await assert.rejects(f.rewards.player(f.br, { action: 'consume', awardId, consumed: true, requestId: 'steal' }), /reward owner/);
  const used = await f.rewards.player(f.ar, { action: 'consume', awardId, consumed: true, requestId: 'use' }); assert.notEqual(used.inventory[0].consumedAt, null);
  const unused = await f.rewards.player(f.ar, { action: 'consume', awardId, consumed: false, requestId: 'undo-use' }); assert.equal(unused.inventory[0].consumedAt, null);
  await assert.rejects(restarted.command(f.ac, { action: 'view' }), /active/);
});
test('Rewards rejects the wrong run and departed members, with no independently created session', async () => {
  const f = await fixture();
  await assert.rejects(f.rewards.game('rpg-bingo', { action: 'draw', sessionId: f.sessionId, playerId: f.a, runId: 'wrong-run', requestId: 'wrong' }), /active/);
  await f.hub.player(f.b, { action: 'leave', sessionId: f.sessionId, requestId: randomUUID() });
  await assert.rejects(f.rewards.player(f.br, { action: 'view' }), /no longer/);
  const staleActivity = rewardDb.collection('rewardActivity').doc();
  await staleActivity.set({ sessionId: f.sessionId, playerId: f.b, eventId: 'departed-activity' });
  await f.rewards.game('rpg-bingo', { action: 'draw', sessionId: f.sessionId, playerId: f.a, runId: f.runId, requestId: 'after-departure' });
  assert.equal((await staleActivity.get()).exists, false);
  assert.equal((await rewardDb.doc(`sessions/${f.sessionId}`).get()).exists, false);
  f.advance(86_400_000 + 1001);
  await assert.rejects(f.rewards.player(f.ar, { action: 'view' }));
});

test('central inventory preserves the 15-second undo lock across reconnects and keeps history free of usage status', async () => {
  const f = await fixture();
  const run = await f.bingo.command(f.ac, { action: 'view' });
  await f.rewards.game('rpg-bingo', { action: 'settle', sessionId: f.sessionId, runId: f.runId, offerId: run.offer!.id, winnerIds: [f.a], requestId: 'first-award' });
  await f.hub.game('rpg-bingo', { action: 'complete', sessionId: f.sessionId, runId: f.runId, eventId: 'first-complete', winnerIds: [f.a], rewardsReceipt: 'first-award' });
  const next = await f.hub.player(f.a, { action: 'current' }) as SessionView;
  const second = await f.rewards.game('rpg-bingo', { action: 'draw', sessionId: f.sessionId, playerId: f.a, runId: next.session.run!.id, requestId: 'second-offer' }) as RewardOffer;
  await f.rewards.game('rpg-bingo', { action: 'settle', sessionId: f.sessionId, runId: next.session.run!.id, offerId: second.id, winnerIds: [f.a], requestId: 'second-award' });
  const inventory = await f.rewards.player(f.ar, { action: 'view' });
  assert.equal(inventory.inventory.length, 2);
  assert.ok(inventory.history.every(a => !('consumedAt' in a)));
  const [one, two] = inventory.inventory;
  await f.rewards.player(f.ar, { action: 'consume', awardId: one.id, consumed: true, requestId: 'use-first' });
  await assert.rejects(f.rewards.player(f.ar, { action: 'consume', awardId: two.id, consumed: true, requestId: 'blocked-second' }), /15-second/);
  const nonce = randomUUID();
  const { credential } = await f.rewards.begin(nonce);
  const grant = await f.hub.player(f.a, { action: 'connect', appId: 'rpg-rewards', sessionId: f.sessionId, nonce }) as Grant;
  await f.rewards.connect(credential, nonce, grant.token);
  await assert.rejects(f.rewards.player(credential, { action: 'consume', awardId: two.id, consumed: true, requestId: 'blocked-reconnected' }), /15-second/);
  await f.rewards.player(credential, { action: 'consume', awardId: one.id, consumed: false, requestId: 'undo-first' });
  await f.rewards.player(credential, { action: 'consume', awardId: two.id, consumed: true, requestId: 'use-second' });
  f.advance(f.now() + 15000);
  await assert.rejects(f.rewards.player(credential, { action: 'consume', awardId: two.id, consumed: false, requestId: 'late-undo' }), /ended/);
  await f.rewards.player(credential, { action: 'consume', awardId: one.id, consumed: true, requestId: 'next-use' });
});

test('concurrent offer and settlement retries are stable and reject changed payloads', async () => {
  const f = await fixture();
  const draw = { action: 'draw', sessionId: f.sessionId, runId: f.runId, playerId: f.a, requestId: 'stable-offer' };
  const offers = await Promise.all(Array.from({ length: 3 }, () => f.rewards.game('rpg-bingo', draw))) as RewardOffer[];
  offers.forEach(offer => assert.deepEqual(offer, offers[0]));
  await assert.rejects(f.rewards.game('rpg-bingo', { ...draw, playerId: f.b }), /Request ID/);
  const settle = { action: 'settle', sessionId: f.sessionId, runId: f.runId, offerId: offers[0].id, winnerIds: [f.a,f.b], requestId: 'stable-settle' };
  const results = await Promise.all(Array.from({ length: 3 }, () => f.rewards.game('rpg-bingo', settle)));
  results.forEach(receipt => assert.deepEqual(receipt, results[0]));
  await assert.rejects(f.rewards.game('rpg-bingo', { ...settle, winnerIds: [f.a] }), /Request ID|different winners/);
  const inventory = await f.rewards.player(f.ar, {action:'view'});
  assert.equal(inventory.inventory.length,1); assert.equal(inventory.history.length,2);
});


test('another member can initialize the existing offer after its original requester leaves', async () => {
  const f = await fixture();
  const initial = await f.bingo.command(f.ac, { action: 'view' });
  await f.ref.update({ offer: null });
  await f.hub.player(f.a, { action: 'leave', sessionId: f.sessionId, requestId: randomUUID() });
  const recovered = await f.bingo.command(f.bc, { action: 'view' });
  assert.deepEqual(recovered.offer, initial.offer);
  assert.equal(recovered.phase, 'playing');
});
