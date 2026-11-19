# Google authentication and permanent rewards

Released November 1, 2026 across Between Turns, Bingo and Rewards. Real Google sign-in, account name/photo, retained session/card and stored account rewards were verified live. See [release evidence and verification limits](RELEASE-2026-11-01-GOOGLE.md).

## Behavior

- Google login is optional. Guests still enter a name and receive session-scoped rewards.
- Google users create and join sessions using their provider display name. Matching Google names are allowed; identity is never inferred from a name or email.
- Google profile photos replace initials in the hub and embedded Bingo, with initials as a missing/broken-image fallback.
- Google-owned awards remain available through My Rewards without an active session, across sessions and devices. Use and the existing 15-second undo window are supported there too.
- Signing in transfers the live guest session's awards to the Google account, including used awards. Expired guest rewards are not revived. Original award document paths, IDs, game identity, timestamps, and consumption state remain intact.
- Signing out leaves the session, invalidates existing account wallet connections, clears embedded views, and creates a fresh guest. Saved rewards remain with the Google account. Account sign-out revocation applies across that account's wallet connections.

## Identity authority

The hub verifies Firebase Authentication and App Check on the callable. `identity` obtains the name and photo from the Admin SDK's `google.com` provider record and matches its subject to the verified Firebase token's Google identity. Client profile fields and account IDs are ignored. No Google credentials are passed to games or Rewards.

`accounts/{googleSubject}` stores the account profile, current central player ID, and wallet connection version. `identities/{playerId}` maps a central player to its Google account. Both collections are server-only. Google subject IDs are distinct from Firebase UIDs.

The central player ID is deliberately preserved when an in-session guest signs in. This keeps Bingo cards, turn order, pending wins and settlement IDs intact. Returning Google login resolves to that same central identity. If the account already has another session, its old membership is detached and the current guest session is retained; the one-session rule still applies. Google subjects are shared only through trusted backend context, never the public roster.

Before OAuth, a guest requests a random, ten-minute `prepareSignIn` claim. Only its hash is stored. The browser retains this short-lived proof in sessionStorage for popup/redirect recovery and submits it to `identity` after Google authentication. Claims bind permanently to the first claiming account and retry safely. Existing Google credentials use sign-in rather than creating a second account. The source guest's old anonymous tokens cannot authorize further commands after ownership changes.

## Reward ownership and migration

The hub transaction creates a durable `rewardTransfers/{hash(sessionId/playerId)}` outbox job only for an active source session. Session expiration/cleanup never deletes these jobs. Rewards fetches jobs through the private, registered-backend API; it acknowledges a job only after completing the transfer. Its minute maintenance retries jobs even if the browser closes.

Rewards first writes `centralOwners/{hash(sessionId/playerId)}` as an ownership fence, then updates existing awards in transactions of at most 200 records. Settlement reads that fence in its own transaction. Awards arriving concurrently therefore receive permanent ownership, and interrupted/repeated migration cannot duplicate an award. Award paths remain `centralSessions/{originSessionId}/awards/{awardId}`; `accountId` is the ownership field, while `playerId` preserves original participant identity. Account inventory uses a collection-group index on `awards.accountId`.

`rewardUseLocks` serializes use across all of an account's awards, including different source sessions. Owner checks are repeated inside the consumption transaction. Only inventory ownership changes; public Session History still omits consumption status.

## Integration additions (version 1, additive)

- Session contexts include optional `accountId` and `photoURL`. Old guest contexts remain valid.
- `accountConnect` is a Google-only player command that issues a one-use, app-bound Rewards grant without session membership. Games cannot redeem it.
- Account-only exchange returns `sessionId: ''`, `runId: null`, `accountId`, and `accountVersion`. Rewards revalidates through `accountContext` before every operation. This context never authorizes game play or new awards.
- Session grants bind account ownership when issued. A guest grant or established iframe connection cannot become an account wallet merely because that guest signs in afterward; a fresh handshake is required.
- Private `rewardTransfers` accepts an optional accountId filter and returns up to 50 jobs. `ackRewardTransfer` deletes one completed job. Only the registered Rewards backend may invoke either operation.

## Release procedure

1. Deploy Rewards functions and the `awards.accountId` collection-group index; wait for the index to finish building. Deploy its UI.
2. Deploy Bingo's embedded backend and UI. Its standalone guest mode retains its existing behavior.
3. Grant the dedicated hub runtime the `firebaseauth.users.get` permission (for example, Firebase Authentication Viewer) in the hub project, in addition to its existing roles. Deploy the hub functions and Hosting configuration.
4. Enable Google in Firebase Authentication for `between-turns-paul`, select the intended project support email, and retain Anonymous Authentication. Keep the existing exact-domain App Check and backend IAM protections.
5. Authorize the Hosting domains in Firebase Authentication and add `https://between-turns-paul.web.app/__/auth/handler` to the Google OAuth client's authorized redirect URIs. On the standard Hosting origin, the frontend uses that same origin as authDomain for the mobile redirect fallback. Custom domains need corresponding configuration. See [Firebase redirect guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices).
6. Deploy the hub frontend. Do not advertise sign-in until Rewards, Bingo, the hub backend, Google provider and index are all ready.
7. Verify real Google login on desktop and mobile, cancellation, an existing account signed into from a different guest/device, photos, guest award transfer, post-session inventory and sign-out. Emulator identities are synthetic and cannot validate Google's production consent screen or browser storage policy.

Release configuration and deployment steps are complete. The Google provider, both callback domains, Auth profile-read permission and permanent-inventory index were verified. The production CSP explicitly permits Google's authentication helper script and same-origin helper iframe. Additional destructive/time-based production checks were not forced; see the release evidence above.

## Local verification

All three projects passed their production builds/type checks. Hub unit tests passed (29), Rewards unit tests passed (3), and Bingo unit tests passed (101). Real Firestore checks passed for the hub's existing session/security behavior, and a separate HTTP/Auth emulator test verified Google-token profile authority, guest claims, automatic naming and rejected cross-account claims.

The cross-project suite passed all eight tests, including in-place transfer into an existing account, preserving Bingo cards and use state, concurrent transfer/settlement, access after session deletion, and recovery after a lost transfer acknowledgement. Bingo's ten embedded service emulator tests also passed. The legacy Rewards emulator checks passed in the full Rewards verification run.

The hub's four browser tests passed using the Auth emulator's synthetic Google popup, including credential-already-in-use recovery, automatic name/photo, refresh, sign-out and 320px layout. Rewards' two browser tests passed with mocked transport and a synthetic parent; these verify inventory/use/undo/history privacy and revoked access, not real OAuth or live hosting. Chromium local-network permission is granted only to that synthetic test origin. Generated local screenshots are under `screenshots/` (ignored).
