# Rewards deployment

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

The adapter uses the same `centralSessions`, `centralConnections`, `centralReceipts` and `centralPlayerReceipts` formats and deterministic offer/award/settlement IDs as the integrated copy inside Bingo. Historical central award records remain readable. Legacy standalone sessions are not imported. Access to records is always gated by current hub membership and expiry; database retention does not confer access.

`maintainCentralRewards` retries durable activity and removes expired opaque browser connections. It also drains the earlier adapter's pending activity records. Legacy standalone cleanup remains only to remove old records. No independent Rewards session clock is used for new central inventory.
