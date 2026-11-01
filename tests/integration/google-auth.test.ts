import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('Firebase Google tokens drive trusted names/photos and securely claim an existing guest', async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Emulator-only test.');
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9299';
  const auth = async (action: string, data: object) => {
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal(response.status, 200, `Emulator authentication failed: ${action}`);
    return response.json() as Promise<{ idToken: string; localId: string }>;
  };
  const call = async (idToken: string, data: object) => {
    const response = await fetch('http://127.0.0.1:5201/demo-between-turns/us-central1/playerCommand', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data }) });
    return { status: response.status, body: await response.json() as any };
  };
  const guest = await auth('signUp', { returnSecureToken: true });
  const session = await call(guest.idToken, { action: 'create', name: 'Guest', requestId: randomUUID() });
  assert.equal(session.status, 200);
  const claim = await call(guest.idToken, { action: 'prepareSignIn' });
  const googleId = `google-${randomUUID()}`;
  const profile = { sub: googleId, name: 'Verified Google Name', picture: 'https://lh3.googleusercontent.com/avatar', email: `${googleId}@example.test`, email_verified: true };
  const google = await auth('signInWithIdp', { requestUri: 'http://127.0.0.1:5180', postBody: new URLSearchParams({ providerId: 'google.com', id_token: JSON.stringify(profile) }).toString(), returnSecureToken: true });
  const identity = await call(google.idToken, { action: 'identity', claim: claim.body.result.token, displayName: 'Forged name', accountId: 'forged-account' });
  assert.equal(identity.status, 200); assert.equal(identity.body.result.displayName, profile.name);
  assert.equal(identity.body.result.photoURL, profile.picture); assert.equal(identity.body.result.playerId, guest.localId);
  const current = await call(google.idToken, { action: 'current' });
  assert.equal(current.body.result.session.id, session.body.result.session.id);
  assert.equal(current.body.result.session.members[0].name, profile.name);
  assert.equal((await call(guest.idToken, { action: 'current' })).status, 401);
  const created = await call(google.idToken, { action: 'create', name: 'Forged', requestId: randomUUID() });
  assert.equal(created.status, 200); assert.equal(created.body.result.session.members[0].name, profile.name);
  const repeat = await call(google.idToken, { action: 'identity', claim: claim.body.result.token });
  assert.equal(repeat.status, 200);
  const other = await auth('signInWithIdp', { requestUri: 'http://127.0.0.1:5180', postBody: new URLSearchParams({ providerId: 'google.com', id_token: JSON.stringify({ ...profile, sub: `other-${randomUUID()}`, email: `other-${randomUUID()}@example.test` }) }).toString(), returnSecureToken: true });
  assert.equal((await call(other.idToken, { action: 'identity', claim: claim.body.result.token })).status, 403);
});
