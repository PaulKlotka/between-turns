import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('These tests require the local Firebase emulators.');
const base = 'http://127.0.0.1:5201/demo-between-turns/us-central1';
const post = async (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
test('HTTP boundaries require a guest for player commands and backend identity for game commands', async () => {
  const anonymous = await post('rewardsPlayerCommand', { data: { action: 'list' } });
  assert.equal(anonymous.status, 401);
  const auth = await fetch('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  assert.equal(auth.status, 200);
  const { idToken } = await auth.json() as { idToken: string };
  const create = await post('rewardsPlayerCommand', { data: { action: 'create', kind: 'solo', name: 'HTTP test', displayName: 'Guest', requestId: randomUUID() } }, { Authorization: `Bearer ${idToken}` });
  assert.equal(create.status, 400);
  const result = { sessionId: `disabled-${randomUUID()}` };
  // A player's Firebase credential is not a trusted game's backend credential.
  const unauthorized = await post('rewardsGameApi', { action: 'draw', sessionId: result.sessionId }, { Authorization: `Bearer ${idToken}` });
  assert.equal(unauthorized.status, 403);
  assert.equal((await post('rewardsGameApi', {}, { 'X-Emulator-Game': 'unregistered' })).status, 403);
  // Neither client reads nor client writes can bypass the API, even with a valid guest token.
  const doc = `http://127.0.0.1:8280/v1/projects/demo-between-turns/databases/rpg-rewards/documents/sessions/${result.sessionId}`;
  assert.equal((await fetch(doc, { headers: { Authorization: `Bearer ${idToken}` } })).status, 403);
  assert.equal((await fetch(doc, { method: 'PATCH', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { name: { stringValue: 'Tampered' } } }) })).status, 403);
});
