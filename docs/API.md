# Rewards integration API

## Google accounts (November 1, 2026 extension)

Session contexts may include a trusted `accountId` and `photoURL`. Existing guest contexts still work. Account-only grants return `sessionId: ''`, `runId: null`, `accountId` and `accountVersion`; Rewards validates these through the hub's private `accountContext` action. This permits inventory view/use/undo without a live session. It does not permit draws or settlements without an active game.

Before account inventory reads, and in minute maintenance, Rewards drains the hub's durable `rewardTransfers` jobs and acknowledges each completed transfer with `ackRewardTransfer`. An ownership fence serializes migration with settlement. Existing award records are updated with account ownership, retaining IDs and use state. Deploy `firestore.indexes.json` for the `awards.accountId` collection-group query. Session cleanup must never recursively delete account awards under `centralSessions`; the existing legacy `sessions` cleanup remains separate.

The `view` response includes `persistent: true` for account inventory, which spans source sessions. Account use/undo shares one 15-second lock across all source sessions. History remains scoped to the current session and excludes consumption status. A signed-out/changed account must perform a fresh handoff; stored guest connections cannot upgrade themselves into account access.

Between Turns is the sole authority for player identity, membership, active runs and expiration. RPG Rewards is embedded-only. Browser calls never supply a player or session ID to authorize inventory operations.

## Embedded browser API

`POST /embeddedApi` is served through the Rewards Hosting rewrite. All replies are `{ result: ... }` or `{ error: { code, message } }`, with `Cache-Control: no-store`. Maximum JSON size is 8 KiB.

1. The iframe validates `btVersion=1`, the nonce, and the exact parent origin against `VITE_BETWEEN_TURNS_ORIGINS`. It checks message source, origin, channel, version and nonce independently of URL values.
2. `{ action: 'begin', nonce }` returns a random opaque `credential`. The backend stores only its hash and a 60-second pending connection.
3. The child sends the hub `ready`. The hub replies with a short-lived, one-use connection grant via `postMessage`.
4. The child sends `{ action: 'connect', nonce, grant }` with `Authorization: Bearer CREDENTIAL`. The Rewards backend exchanges the grant using its own service identity and binds the returned central context to the browser credential.
5. Subsequent requests use that credential, kept only in frame memory. No third-party cookies, independent Firebase login, credentials in URLs, or persistent credential storage are required.

Commands after connection:

```json
{ "action": "view" }
```

Returns `{ inventory, history, serverNow }`. Inventory contains only this player's awards and consumption timestamps. History contains reward definitions, winner names, game IDs and award times; it does not expose usage status.

```json
{ "action": "consume", "awardId": "AWARD_ID", "consumed": true, "requestId": "STABLE_EVENT_ID" }
```

Use `consumed:false` to undo within 15 seconds. Only the owner can change an award. Other reward uses are blocked during that player's undo window, including across tabs and reconnects. Retries reuse the exact request ID and payload. Reads and no-ops do not extend session life.

Use `/embed?view=inventory` for My Rewards and `/embed?view=history` for Session History. The hub supplies the handshake parameters. The optional `rewards-view` parent message selects either view with the same envelope and checks; navigation belongs to the hub.

## Trusted game API

`POST gameApi` accepts only registered game service accounts. Keep IAM invocation private. Obtain a Google service-account OIDC ID token for the exact endpoint URL, set that URL as `GAME_API_AUDIENCE`, and send `Authorization: Bearer ID_TOKEN`. The handler verifies signature, issuer, audience, verified email, and the exact `GAME_CLIENTS_JSON` registration. A player's Firebase credential cannot authorize a game request.

```json
{ "action": "draw", "sessionId": "HUB_SESSION_ID", "playerId": "HUB_PLAYER_ID", "runId": "HUB_RUN_ID", "requestId": "STABLE_OFFER_EVENT" }
```

Returns `{ id, gameId, sessionId, runId, reward: { id, name, qualifyingRoll }, createdAt }`. The hub verifies membership and that this game owns the active run. Exactly one offer exists for a game/run, even if concurrent callers use different request IDs. Every catalog entry is equally likely. Store the offered definition and display it throughout the game.

```json
{ "action": "settle", "sessionId": "HUB_SESSION_ID", "runId": "HUB_RUN_ID", "offerId": "OFFER_ID", "winnerIds": ["HUB_PLAYER_ID"], "requestId": "STABLE_SETTLEMENT_EVENT" }
```

The trusted game backend validates wins. Rewards verifies central membership and the active game/run before a new settlement, atomically awards the exact offer to all unique winners, and returns `{ receipt }`. Replays return the same receipt without duplicate awards. Changed winners or reuse of a request ID with different input is rejected. Rewards writes and activity reports have a durable outbox. The game must save the receipt before reporting `complete` to Between Turns.

Rewards revalidates central membership and expiry before every browser operation. Local data cannot authorize expired or departed players. Reads never report activity. Only actual new offers, awards and use/undo changes report activity; the hub owns the inactivity deadline.

## Local-only testing

Functions emulator game calls use `X-Emulator-Game: rpg-bingo`. Hub calls use `X-Emulator-App: rpg-rewards`. These shortcuts are enabled only by server-side `FUNCTIONS_EMULATOR=true`. Production requires the registered service identity.
