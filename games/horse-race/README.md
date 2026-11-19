# Horse Race

Horse Race is an embedded Between Turns game. Each session member gets four distinct random numbers from 1 through 20; different players can share numbers. Reporting one physical d20 result gives one hit to every current member whose numbers include it. The first roll to bring players to ten hits freezes all those players as joint winners. RPG Rewards supplies the shared prize and awards one copy to each winner before Between Turns records the result and selects the next game.

The server takes the complete roster from the hub, including members who have not opened Horse Race. New members start at zero when the game next synchronizes the roster. Departed players stop receiving hits; returning members retain their numbers and score for that run. Refreshing or reconnecting never redraws numbers. Numbers and hit bars are visible to the whole party.

Anyone can report successive physical rolls. Report each physical roll only once. Network retries reuse request IDs and never count twice; two separately submitted reports are treated as two rolls. The reporter can undo the latest submission until another roll replaces it. A winning roll has a 15-second correction window; subsequent roll submissions during that window are ignored. The reporter can undo the winning roll and restore every horse. Winners departing during review are excluded; if all winners depart, play resumes.

## Security and lifecycle

Between Turns owns membership, session expiry, guest/Google identity and run selection. Horse Race exchanges the hub's one-use grant on its server, revalidates central membership and identity before each command, and keeps the browser credential in memory. Standalone play is refused. Firestore remains inaccessible to browsers. Random assignments, command receipts, activity and reward settlement belong in the dedicated Horse Race project's own Firestore database under `horseRaces` and `horseConnections`. Its runtime must have no access to Roll Race infrastructure or data; its only cross-project application grants target the private Between Turns integration API and RPG Rewards game API.

Shared winner IDs and settlement work are persisted. Polling and the scheduled worker retry reward settlement and hub completion with stable IDs; completion follows the persisted reward receipt. The existing Rewards implementation supplies account ownership and guest continuity. A membership change between reward settlement and hub completion is subject to those existing services' current-member requirements and still needs live verification.

## Local verification

1. Run `npm install` and `npm --prefix functions install`.
2. Run `npm test` and `npm run build`.
3. Start a local Firestore emulator at `127.0.0.1:8580` for `demo-horse-race`, then set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8580` and run `npm run test:integration`. The integration suite also imports the sibling Between Turns and RPG Rewards services from this workspace. It refuses to run without an emulator address.
4. Run `npm run test:browser`. This uses headless Microsoft Edge to check the actual production bundle with a mocked parent/API at desktop and phone widths. It does not represent a production authentication or deployment check.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact proposed cloud changes and approval status. No deployment has been completed.
