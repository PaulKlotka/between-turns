# Cross-project implementation handoff

The Rewards repository now contains the central backend and embedded-only player application. Bingo's existing embedded backend implements reward requests, winner validation, durable settlement retry, and hub completion. The Bingo changes use the current member and a stable per-player initialization request, so a missing offer can be recovered after its original requester leaves without conflicting with an earlier request receipt.

The current editing session can read sibling repositories but cannot write them. The changes for the actual `between-turns` and `rpg-bingo` repositories are therefore saved as reviewable patches. They have been checked with `git apply --check` against both source checkouts. The cross-project tests run against isolated copies with these patches applied.

From a user PowerShell in RPG Rewards, apply both checked patches:

```powershell
.\scripts\apply-integration-patches.ps1
```

This script checks both patches before changing either checkout. It makes no commits and performs no deployment. If source files have changed, inspect the patch failure and reconcile those changes first.

## Changes by project

- **Rewards:** embedded My Rewards and Session History, no independent login or session controls, central membership/expiry validation, private game API, stable per-run offers, atomic tied-winner settlement, retry receipts, durable activity reports, owner-only consumption and the 15-second undo lock. History omits consumption state. Existing central award storage is preserved.
- **Between Turns:** navigation for both Rewards views, iframe URLs selecting the requested view, active-game validation for Rewards context requests, reconnection grants, and frame policy allowing the two child apps. Game iframe lifetime and existing fitting behavior remain intact.
- **Bingo:** use the current authenticated central member when initializing a missing offer. Existing gameplay, win review, settlement outbox and completion flow are retained.

There are integrated copies under `rpg-bingo/integrations` as well as separate canonical repositories. Those copies may differ from the canonical sources. Publish from a deliberately chosen source and avoid independently deploying stale copies afterward. No copied directory or existing production configuration was overwritten by this work.

## Validation

Run `npm run verify:emulators` for real-service scenarios using isolated hub, game and Rewards databases. The scenarios cover tied winners, lost settlement responses, next-game transitions, cross-game reward persistence, active-run validation, departure, expiry, owner-only use, reconnects, undo boundaries, history privacy and concurrent retries.

Run `npm run test:browser` for the standalone redirect and embedded inventory/history at desktop, 390px and 320px widths. This uses a real parent origin and mocked browser transport; backend behavior is covered separately by emulator tests.

## Activation

Apply the source patches, then follow `docs/DEPLOYMENT.md` for app registration, service-account invocation grants, HTTPS endpoint configuration and browser endpoint invocation. Keep Bingo unready until the configured services pass an end-to-end check. The initial implementation did not deploy. The subsequent authorized release deployed all three projects on November 1, 2026, with scoped invocation configuration.

## Verification results before deployment

- Rewards production build and TypeScript checks passed.
- All 18 emulator integration tests passed, plus the targeted offer-recovery test for a departed original requester.
- All 3 Rewards unit tests, 23 patched-hub unit tests and 101 Bingo unit tests passed.
- Both browser scenarios passed, including 320px/390px layouts. The Playwright process did not finish shutting down after reporting both successes and was interrupted during teardown.
- Both sibling patches pass `git apply --check`. The patched source copies pass TypeScript checks; Bingo's backend builds.
- No changes were applied to the sibling source checkouts. No cloud deployment or IAM changes were performed.


## November 1, 2026 release

The patched source for all three projects was built and deployed. Between Turns and Bingo were deployed from isolated copies of the patched canonical checkouts; Rewards was deployed from this repository. Backend functions, Firestore rules/indexes where configured, and Hosting all reported successful deployment. Existing dedicated runtime identities were retained. The hub integration API and Rewards game API return HTTP 403 without backend credentials; all three sites return HTTP 200 with the new asset versions.

The canonical ignored backend environments still contained placeholder registries. Deployment used the already-integrated production environment from the Bingo integration copies rather than resetting the live hub to placeholders. Rewards now has that integrated configuration in its ignored Functions environment; Between Turns uses it in the prepared deployment copy. Keep those production registries synchronized before future releases. No credential values are stored in this report.

Live release verification passed against the deployed HTTPS sites: two independent guests created/joined a session, played Bingo, received the winning reward, saw Session History without usage status, used and undid a reward, retained consumption after refresh, reloaded the child iframe, and navigated without losing the game. Both 390px and 320px layouts passed with no browser page errors. A narrow-iframe minimum-width issue found during verification was corrected and the Rewards frontend republished.

The automated browser used Firebase's documented CI App Check provider. Its temporary debug credential was revoked after the check, and the temporary players left their test session. Production App Check enforcement and private backend invocation remain enabled.
