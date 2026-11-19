# Rewards deployment

> Historical standalone deployment record. Use the [monorepo migration runbook](../../../docs/FIREBASE-MIGRATION.md) for production changes.

November 1 Google-account release: updated functions and Hosting are deployed, the `awards.accountId` collection-group index is READY, and a real signed-in account's saved inventory was verified with its original award ID and no duplicate award records. Backend IAM remains private; embedded browser requests retain server-bound credential checks. See the sibling hub's `docs/RELEASE-2026-11-01-GOOGLE.md` for evidence and test limits.

Build and verify locally before deploying. The integration updates were deployed to the existing three Firebase projects on November 1, 2026. Existing runtime identities were retained, scoped backend invocation was configured, and browser transport was verified.

## Configuration

Use the existing dedicated runtime identities. Configure the Rewards backend:

```dotenv
REWARDS_RUNTIME_SERVICE_ACCOUNT=rewards-runtime@rpg-rewards-paul.iam.gserviceaccount.com
BETWEEN_TURNS_API_URL=https://REGION-HUB_PROJECT.cloudfunctions.net/integrationApi
GAME_API_AUDIENCE=https://REGION-REWARDS_PROJECT.cloudfunctions.net/gameApi
GAME_CLIENTS_JSON={"rpg-bingo":{"serviceAccount":"bingo-runtime@rpg-bingo-paul.iam.gserviceaccount.com"}}
REWARDS_BROWSER_ORIGINS=https://rpg-rewards-paul.web.app
```

Set the frontend `VITE_BETWEEN_TURNS_ORIGINS=https://between-turns-paul.web.app`. These are endpoint URLs, origins, and service-account identifiers; no private keys belong in frontend configuration.

Register `rpg-rewards` as the hub's sole `kind:rewards` app with its runtime service account, exact origin, and `embedUrl:https://rpg-rewards-paul.web.app/embed`. Register Bingo's backend separately. Configure Bingo's existing `BETWEEN_TURNS_API_URL` and `REWARDS_GAME_API_URL` variables.

Grant the Rewards runtime identity invoker access only to the hub integration API. Grant the Bingo runtime identity invoker access to the hub integration API and Rewards game API. Keep both backend integration APIs private. Application handlers also validate service-account tokens against the configured registry.

Deploy the hub changes from the checked patch before using Rewards: it must validate `runId` and `gameId` on context requests from the registered Rewards service. Hosting must permit Rewards and Bingo in `frame-src`. Rewards permits the exact hub origin in `frame-ancestors`.

## Release

1. Apply and review the sibling source patches described in `integration/README.md`.
2. Run `npm test`, `npm run build`, `npm run verify:emulators`, and `npm run test:browser`. Build/typecheck the patched hub and Bingo repositories as well.
3. Deploy configured backend services and Firestore rules. All browser Firestore access remains denied.
4. Deploy Hosting. `/embeddedApi` must rewrite to the browser function before the SPA fallback.
5. Configure HTTP invocation for `embeddedApi`. The existing `scripts/configure-player-endpoint.cjs` now targets this function. It configures the service-level invocation setting without changing organization sharing policy; backend-only endpoints stay private. The browser function authorizes opaque credentials bound to exchanged hub context. The retired player callable refuses standalone commands.
6. Verify the actual hub/grant exchange and a complete Bingo game with two guests, then inventory use/undo, history, refresh, navigation, late join, departure and expiry.
7. Mark Bingo ready in the hub only after this verification passes.

`npm run deploy` builds Rewards, deploys its configured resources and runs the browser-invocation configuration script. It does not deploy the sibling source repositories. Check the Firebase CLI's project selection and existing function list before using it.

## Data compatibility

The adapter uses the same `centralSessions`, `centralConnections`, `centralReceipts` and `centralPlayerReceipts` formats and deterministic offer/award/settlement IDs as the integrated copy inside Bingo. Historical central award records remain readable. Legacy standalone sessions are not imported. Guest access remains gated by current hub membership and expiry. Google account inventory uses verified account ownership and can be accessed after a session ends; database retention alone never confers access.

`maintainCentralRewards` retries durable activity and removes expired opaque browser connections. It also drains the earlier adapter's pending activity records. Legacy standalone cleanup remains only to remove old records. No independent Rewards session clock is used for new central inventory.

## Horse Race integration prepared (November 15, 2026)

Horse Race uses the existing multi-winner `draw`/`settle` API. No Rewards service implementation change is needed. Its dedicated runtime must be merged into `GAME_CLIENTS_JSON`, with private `gameApi` invocation granted only to that identity. The concrete proposed principal, resource scopes and remaining approval are documented in `../../horse-race/DEPLOYMENT.md`. No Horse Race production registration or permission has been changed. Preserve the union of the current live registries: `gameApi` already includes Push Your Luck even though some other function env snapshots are older. Local service integration testing verifies one award for each joint winner and the existing guest/account ownership fields; it does not verify live Google sign-in.

November 18 architecture correction: register Horse Race only as horse-race-runtime@horse-race-paul.iam.gserviceaccount.com from its dedicated project. Its only Rewards permission is service-scoped roles/run.invoker on gameapi; it must not receive Rewards database access or any Roll Race access. The shared-project proposal is superseded. Firebase Functions requires Blaze, and no billing changes are authorized; current project state could not be rechecked because the saved Firebase login expired.

