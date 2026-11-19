# Production release — November 13, 2026

Push Your Luck is deployed in the separate push-your-luck-paul Firebase project and enabled in the Between Turns catalog alongside Bingo and Roll Race. Play from https://between-turns-paul.web.app. Direct visits to https://push-your-luck-paul.web.app point players to the hub.

The authorized billing changes are complete: FreeH2O has no billing account (Spark), Roll Race remains billed, and Push Your Luck is linked to the existing billing account. All new and updated Functions are ACTIVE. The minute maintenance job is ENABLED. Both Hosting releases succeeded.

The game browser endpoint's public transport setting was explicitly approved. A gameplay request without the frame credential returned HTTP 401; beginning a frame handshake returned HTTP 200. Hub integrationApi, Rewards gameApi and game maintenance remain private. Existing service invokers were retained and the new runtime was added only to the two integration services.

The hub Content Security Policy now includes the documented https://www.google.com/recaptcha/ connect path. This fixed a blocked network call in normal App Check attestation. No authentication enforcement or risk threshold was lowered. Headless automated browsers were rejected by attestation; the real connected Edge browser completed the live checks successfully without a debug bypass. Temporary deployment debug tokens were revoked and verified absent.

Verified in the normal Edge browser with a temporary guest session:

- The game was available beside Bingo and Roll Race and selected by the hub vote.
- A real iframe grant exchange initialized the solo race and drew Database Recall from RPG Rewards.
- Manual banking protected 8 treasure, bank undo restored it, and re-banking skipped exactly the next roll.
- A natural 1 removed unbanked treasure while preserving the banked total.
- Natural 20s auto-banked without skips. At 108 banked treasure, roll entry paused for the 15-second winning review.
- Rewards inventory displayed Database Recall with the proper benefit. Session History recorded Deployment check as the winner.
- Between Turns began the next game selection. Its Session results listed the completed Push Your Luck run.
- The temporary session was left and the guest name field restored to Paul.

Local verification remains 20 domain tests and 14 emulator/service tests, browser viewport/control checks and production builds. Real Google-account play and live multiplayer tied wins were not independently exercised for this release; the real-service emulator tests cover permanent account ownership and joint awards.

Deployment workflow: Windows shell-based function discovery failed, so scripts/generate-manifest.cjs generated SDK manifests directly from compiled sources. Ignored firebase.deploy.json configurations omit shell hooks. Regenerate manifests after source builds before deploying. The CLI's optional artifact deletion setup was rejected by automatic approval review; no deletion policy was enabled, and Hosting was published separately after the functions succeeded.

Future deploys must reread live registries and preserve their entries. The deployed hub source and production environment files are staged under .deployment/between-turns, and Rewards configuration under .deployment/rpg-rewards. Incorporate docs/integration/hub-roster.patch and the Hosting policy changes into the original hub checkout before its next ordinary source deployment. This workspace cannot write the sibling checkouts.
