import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HubService } from '../../functions/src/service';
import { MemoryStore } from '../helpers';
import { GENERAL_REWARD_LIST, type RewardListReference } from '../../shared/reward-lists';
import type { ConnectionContext, GameCommand, SessionView } from '../../shared/types';

const custom: RewardListReference = { snapshotId: 'snapshot-1', sourceListId: 'private-1', rpgId: 'pathfinder 2e', rpgName: 'Pathfinder 2E', listName: 'Heroic' };
async function fixture() {
  const store = new MemoryStore();
  const hub = new HubService(store, [{ id: 'bingo', name: 'Bingo', description: '', ready: true }], [
    { id: 'bingo', kind: 'game', origin: 'https://bingo.example' }, { id: 'rewards', kind: 'rewards', origin: 'https://rewards.example' },
  ], () => 1000);
  const view = await hub.player('a', { action: 'create', name: 'A', requestId: 'create' }) as SessionView;
  await hub.player('b', { action: 'join', code: view.session.code, name: 'B', requestId: 'join' });
  const select = (playerId = 'b', rewardList = custom, eventId = 'select') => hub.game('rewards', { action: 'selectRewardList', sessionId: view.session.id, playerId, accountId: null, eventId, rewardList });
  const current = () => hub.player('a', { action: 'current' }) as Promise<SessionView>;
  return { hub, store, view, select, current };
}

test('any member selects a list in the lobby; first run captures it', async () => {
  const f = await fixture(); await f.select();
  const v = await f.hub.player('a', { action: 'start', sessionId: f.view.session.id, requestId: 'start' }) as SessionView;
  assert.deepEqual(v.session.run!.rewardList, custom);
  const c = await f.hub.game('rewards', { action: 'context', sessionId: v.session.id, playerId: 'b' }) as ConnectionContext;
  assert.deepEqual(c.rewardList, custom); assert.deepEqual(c.selectedRewardList, custom);
});

test('switches never change an existing run and retries cannot overwrite a newer selection', async () => {
  const f = await fixture();
  await f.hub.player('a', { action: 'start', sessionId: f.view.session.id, requestId: 'start' });
  await f.select(); const changed = { ...custom, snapshotId: 'snapshot-2', listName: 'Second' };
  await f.select('a', changed, 'second'); await f.select();
  const before = await f.current();
  assert.deepEqual(before.session.run!.rewardList, GENERAL_REWARD_LIST);
  assert.deepEqual(before.session.selectedRewardList, changed);
  await f.hub.game('bingo', { action: 'complete', sessionId: before.session.id, runId: before.session.run!.id, eventId: 'done', winnerIds: [], rewardsReceipt: 'receipt' });
  assert.deepEqual((await f.current()).session.run!.rewardList, changed);
});

test('selection rejects other apps, outsiders, changed accounts, malformed metadata, and reused events', async () => {
  const f = await fixture();
  const command: GameCommand = { action: 'selectRewardList', sessionId: f.view.session.id, playerId: 'b', accountId: null, eventId: 'select', rewardList: custom };
  await assert.rejects(f.hub.game('bingo', command), /Only Rewards/);
  await assert.rejects(f.select('outsider'), /no longer/);
  await assert.rejects(f.hub.game('rewards', { ...command, accountId: 'other' }), /Identity changed/);
  await assert.rejects(f.select('b', { ...custom, snapshotId: '../private' }), /invalid/);
  await f.select();
  await assert.rejects(f.select('b', { ...custom, listName: 'Changed' }), /different data/);
});

test('legacy runs remain on the default when a new list is queued', async () => {
  const f = await fixture();
  const session = f.store.data.get(`sessions/${f.view.session.id}`) as any;
  session.phase = 'playing'; session.run = { id: 'legacy', gameId: 'bingo', startedAt: 1000 };
  await f.select();
  const context = await f.hub.game('rewards', { action: 'context', sessionId: session.id, playerId: 'b' }) as ConnectionContext;
  assert.deepEqual(context.rewardList, GENERAL_REWARD_LIST);
  assert.deepEqual(context.selectedRewardList, custom);
});

test('only Rewards can inspect retention, including closed or missing sessions', async () => {
  const f = await fixture();
  await assert.rejects(f.hub.game('bingo', { action: 'rewardSessionStatus', sessionId: f.view.session.id }), /Only Rewards/);
  assert.deepEqual(await f.hub.game('rewards', { action: 'rewardSessionStatus', sessionId: f.view.session.id }), { active: true, expiresAt: f.view.session.expiresAt });
  assert.deepEqual(await f.hub.game('rewards', { action: 'rewardSessionStatus', sessionId: 'missing' }), { active: false, expiresAt: 0 });
});
