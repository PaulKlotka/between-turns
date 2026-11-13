# Push Your Luck

A physical-d20 treasure game embedded in Between Turns. Between Turns owns identity, session membership, presence, game choice and inactivity expiration. RPG Rewards chooses the displayed prize and awards it to confirmed winners. This project owns server-validated treasure, banking, roll entry, undo and result review.

## Confirmed rules

- Bank 100 treasure to win. A natural 1 removes at-risk treasure; 2–19 add their value; 20 adds 20 and automatically banks without a sit-out.
- Pressing Bank protects all current at-risk treasure and skips exactly the next recorded roll. Keeping going requires no action.
- Solo play allows 15 recorded rolls, automatically banks surviving at-risk treasure after roll 15, and ends with either a reward or a final score. A final natural 1 destroys risk before automatic banking.
- Start solo when one player is connected. Admitting a second participant changes the race to multiplayer with no roll limit. A multiplayer race remains multiplayer when players disconnect or leave.
- Encourage the physical roller to enter the unmodified result. One player cannot record consecutive rolls while multiple players are connected. With one connected player, consecutive rolls are permitted in either mode.
- All current participants collect the shared rolls, including disconnected participants. New participants start at zero. Offline session members who have never participated are not entered into a new solo race.
- The first manual bank reaching 100 wins. When a shared roll sends multiple players over 100, the highest banked total wins; equal highest totals are joint winners. Joint winners receive the same offered prize.
- Undo the latest roll until another roll is accepted, or undo your own manual bank until the next roll. Only the roll submitter can undo that roll. Undoing a roll reverses treasure effects and any banks made from that roll afterward; the server restores the pre-roll state. Undo is one level and never resurrects departed members.
- Winning rolls, winning banks and solo failures all get a 15-second review. Rolls and banking pause during review. Only the triggering action can be undone, before the server deadline. Then settle any rewards and report completion to Between Turns. The game never chooses or starts its own next race.

## Run and verify

Node 22.12+ (Node 24 works for local checks), Java 21+, and Edge on Windows.

```powershell
npm ci
npm --prefix functions ci
npm test
npm run build
npm run prepare:integrations
node scripts/prepare-test-dependencies.cjs
npm run verify:emulators
npm run test:browser
```

`verify:emulators` starts a local Firestore emulator with the actual deny-all browser rules, runs service/concurrency and real hub/Rewards tests, then stops the emulator. It locates the existing emulator jar in sibling checkouts or accepts `FIRESTORE_EMULATOR_JAR`. To use an already running emulator instead, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8580` and run `npm run test:integration`.

For browser development use `npm run dev` (port 5183). The embedded API proxy expects the Functions emulator on port 5301. Launch through the hub at port 5180; direct navigation deliberately offers no independent sign-in or session controls.

## Integration and deployment

See [integration](docs/INTEGRATION.md), [deployment](docs/DEPLOYMENT.md) and [verification](docs/VERIFICATION.md). The Firebase target is `push-your-luck-paul` in `us-central1`, with the same billing account as Roll Race.

`prepare:integrations` builds isolated sibling source copies under ignored `.deployment/`, adds the hub roster/presence extension, and prepares its frame policy. The reviewable patch is in `docs/integration/hub-roster.patch`. Sibling repositories are not modified by this task. Their production registry values must be read live and merged before deploying; existing Bingo, Roll Race and Rewards registrations must be retained.

## Release status

Implemented and verified locally. Firebase authentication is complete and the new project `push-your-luck-paul` has been created. Google rejected linkage to the existing billing account with `FAILED_PRECONDITION / QuotaFailure: Cloud billing quota exceeded`. Billing is disabled on the new project, so backend deployment and live integration are pending quota resolution. Existing live registries and deployments remain unchanged.

