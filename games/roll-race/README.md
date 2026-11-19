# Roll Race

Roll Race is an embedded Between Turns game. It accepts physical d20 results only; the shared sequence and its length remain in server-side Firestore, which denies all direct browser access. Between Turns owns the player, session, active run and next-game choice. RPG Rewards supplies and settles the offer.

Each race chooses a uniform random length from 3–7. Each challenge independently selects one of seven categories with equal probability: low (1–5), medium (6–10), high (11–15), very high (16–20), even, odd, or an exact number uniformly chosen from 1–20. Existing races retain their original challenge definitions. Definitions are displayed on the current challenge. Each press submits one physical roll. In multiplayer, a player can undo the most recent roll until another player submits a roll; the prior player waits for another submission before entering again. Solo players cannot undo and can roll again immediately. A multiplayer winning roll starts a 15-second review; the winner can undo during that window and other submissions are ignored. A solo winning roll settles immediately. Concurrent submissions and undo serialize on the race document, and stable receipts prevent replay.

The game draws one Rewards offer for the run, freezes the winner and persists settlement work in the race document. Settlement and central completion use stable IDs; a scheduled worker and browser polling retry failures. Completion is sent only after the Rewards receipt is persisted. The server revalidates central membership before player operations. The browser holds only a short-lived opaque connection credential in memory and exchanges the hub's one-use grant server-side.

## Local checks

Install dependencies with `npm install` and `npm --prefix functions install`. Run `npm test` and `npm run build`. The unit tests do not replace real Firestore concurrency or three-service emulator and browser checks.

## Future deployments

Use the configured Firebase project and the values described in `functions/.env.example`. Before deploying, read and preserve the live hub `APPS_JSON` and `GAMES_JSON` and Rewards `GAME_CLIENTS_JSON`; merge registrations instead of replacing them with placeholders. Preserve the exact embed origins, separate runtime identity and private backend invocation policies. Deploying the hub integration function can reset its Cloud Run invoker policy: immediately verify and restore the existing Bingo, Rewards and Roll Race runtime identities after deployment. Verify production endpoints, schedules and a real game after changes.
## Release status (November 12, 2026)

Roll Race is deployed in the separate `roll-race-paul` Firebase project at https://roll-race-paul.web.app and is available from https://between-turns-paul.web.app. The project uses the existing Firebase Payment billing account. Its standard Firestore database denies browser access; the dedicated `roll-race-runtime@roll-race-paul.iam.gserviceaccount.com` account accesses its own database and is authorized to invoke only the existing hub and Rewards integration endpoints. The browser endpoint uses a server-bound opaque connection credential. Both functions are ACTIVE and the retry schedule is ENABLED.

The deployed hub and Rewards registrations retain the previous Bingo and Rewards entries and include Roll Race. The hub frame policy includes the exact Roll Race origin. The production registry values were read back from every affected function and synchronized into the ignored local production environment files so a later normal deploy preserves the integrations. Before every future deployment, reread the live registries and merge changes rather than relying on a stale local snapshot.

The local suite covers challenge secrecy, ordered rolls, concurrency, replay receipts, identity changes, undo races, winning-review deadlines, and lost settlement and completion responses with a Firestore emulator and the current hub and Rewards services. An automated live guest session selected Roll Race, completed it with test inputs, confirmed a Rewards inventory entry and hub result, and observed the next-game transition. That automated session used a temporary App Check debug credential, which was revoked and verified absent afterward. A separate normal Edge browser check reached the guest entry screen with App Check enabled. Live authenticated Google-account play and real physical-die play were not independently verified during this release.



The subsequent roll-grid update was tested with two live guest sessions, including undo before and during the winning review, reward settlement and the next-game transition. The live browser test used a temporary App Check debug credential that was revoked after testing.


