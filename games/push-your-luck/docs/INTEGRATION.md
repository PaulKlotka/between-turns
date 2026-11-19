# Integration

The existing Between Turns v1 iframe handshake is used unchanged: exact origin/source/nonce checks, a short-lived server-created opaque browser credential, a one-use hub grant exchanged backend-to-backend, and central context validation for every player operation. Browser credentials stay only in iframe memory. The game has no independent login, session creation or rewards inventory.

The hub context extension is additive: `members: [{id,name,connected}]` and `connectedCount`. Only public roster fields are returned; no connection leases or credentials are exposed. Push Your Luck refuses moves if these fields are missing. Existing apps ignore the additional fields. Hub presence leases determine connected status, so an unexpected disconnect can take about 60 seconds to expire.

The extension is staged by `npm run prepare:integrations`. To incorporate it into the original hub checkout later, inspect and apply `docs/integration/hub-roster.patch` with `git apply --unidiff-zero --ignore-space-change` from that checkout. This workspace can write only the new project, so staged source copies support testing and a later deployment without changing the siblings.

One `runId` maps to exactly one race. State is a bounded roster (up to 32) with banked/risk/skip values. A single Firestore race document serializes rolls, bank actions, undo and review deadlines. Stable player-command receipts prevent replay. An undo snapshot captures the immediately preceding roll state; manual banks use separate per-player snapshots. Reversing an invalid roll also reverses dependent bank actions, preserving banked/risk totals.

The new backend calls RPG Rewards `draw` once per run through stable request IDs. All joint winners use the exact same offer. After review, it persists reward settlement before completing the hub run. A solo loss deliberately skips `settle` (Rewards rejects empty winners) and completes with an empty winner list and a stable no-award reference. Hub completion is idempotent and selects the next game.

Activity and settlement work are durable. Browser polling and minute maintenance retry failures; a lost settlement/completion response cannot duplicate awards or results. Access requires current central membership, active run and matching account identity. Expired opaque connections must reconnect through the hub. Direct browser Firestore access is denied. Seven-day-old race state and expired connections are removed independently of permanent account reward storage.

Production changes required:

- New project: Functions, Firestore rules and Hosting for `push-your-luck-paul`.
- Hub: additive roster/presence context fields; merge `push-your-luck` in `APPS_JSON` and `GAMES_JSON`; exact new frame origin.
- Rewards: merge the new dedicated game runtime account in `GAME_CLIENTS_JSON`. No Rewards gameplay/source changes are required.
- IAM: grant the new runtime account invocation on the private hub integration and Rewards game endpoints, with database access limited to its own project.
