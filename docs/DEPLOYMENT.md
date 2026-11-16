# Deployment

Status: Deployed and enabled in Between Turns. FreeH2O is on Spark, Roll Race remains billed and Push Your Luck is billed. Browser transport approval was granted and applied; gameplay remains protected by the central grant exchange. All functions are ACTIVE and the minute job is ENABLED. See [release evidence](RELEASE.md).

## Authenticate

`npm run firebase -- login --reauth` uses this checkout's ignored Firebase CLI configuration. The Firebase login was refreshed successfully; credentials are never committed. This avoids needing writes to the machine-global CLI configuration directories, which this session cannot access.

## Provision and deploy the new project

1. Read the current Roll Race billing association and reuse that billing account. Create `push-your-luck-paul`, add Firebase, link billing, enable Firestore Native in `us-central1`, Functions, Cloud Build, Artifact Registry, Scheduler, Run and Hosting. Use the existing account's organization settings and dedicated runtime pattern; do not alter organization sharing policies.
2. Create `push-your-luck-runtime@push-your-luck-paul.iam.gserviceaccount.com`. Grant `roles/datastore.user` in the new project and the required service-account-user/build permissions to deployment/build identities. Existing project databases do not need to be accessible to this game account.
3. Copy `functions/.env.example` to ignored `functions/.env.push-your-luck-paul`. Verify the exact live integration endpoint URLs. Build and deploy explicitly to the new project:

```powershell
npm run build
npm run firebase -- deploy --only firestore:rules,functions,hosting --project push-your-luck-paul --non-interactive
```

4. Enable public HTTP transport only on the game's `embeddedapi` Cloud Run service, using the same service-level invoker-IAM-disabled mechanism as the existing embedded games if organization policy prevents an `allUsers` grant. Its handler still requires a server-bound opaque browser credential. Keep the scheduled job and both cross-project integration APIs private. Verify the new maintenance schedule and set a short artifact cleanup policy.

## Register with the existing services

1. Read the **live** hub `APPS_JSON`, `GAMES_JSON` and Rewards `GAME_CLIENTS_JSON`; preserve every existing entry and relevant environment variable. Do not deploy placeholder registries from source examples.
2. Stage current source with `npm run prepare:integrations`. Merge the game app entry (`id: push-your-luck`, kind game, exact new Hosting origin and runtime service account). Add its game catalog entry initially with `ready:false`. Merge the new runtime in the Rewards game-client map with an empty redirect URI list.
3. Deploy the staged hub roster extension and merged registries, and Rewards' merged registry. Restore and verify **all existing** registered runtime invocation bindings after any integration-function redeploy. Add the new runtime's `roles/run.invoker` binding on the hub `integrationapi` and Rewards `gameapi` services, not project-wide public access.
4. Build the staged hub frontend with its existing production public Firebase configuration. Merge the new `frame-src` origin with the current live Hosting policy and deploy Hosting. The game's policy already permits the exact hub origin in `frame-ancestors`.
5. Verify deployed guest and Google-account handoffs, two players seeing the same race, manual-bank skip, 20 auto-bank, natural-1 bust, undo, a joint award and a solo failure, then mark the game `ready:true`. Verify all previously available games remain registered and playable and the next-game transition belongs to the hub.
6. Preserve merged production environment files and incorporate the context patch in the original hub source before its next normal deployment, so the integration cannot regress. Do not mark production deployment complete until live endpoints, invocation policies, schedules and actual gameplay are verified.

The local tests use isolated source copies; they do not prove production IAM, billing, Hosting policy or real Google OAuth. Those checks remain outstanding.

## Resume after the billing quota is resolved

Run `node --use-system-ca scripts/provision.cjs` to retry billing linkage and provision APIs, runtime IAM and Firestore. Reread and merge live registries with `node --use-system-ca scripts/prepare-live-config.cjs` before any integration deploy. This prepares ignored staged environment files with the new game disabled, plus a Hosting frame policy derived from the actual live response. It does not change live services. The staged hub frontend has its production configuration copied from the existing checkout. Continue the deployment and live verification steps above, and only enable the game after verification.


## Deployment evidence and remaining final step

Both new functions are healthy; the minute schedule is ENABLED. The hub roster extension and merged registrations are deployed; its frame policy includes the game. Hosting releases completed for the new game and hub. Windows shell discovery was bypassed using scripts/generate-manifest.cjs to generate SDK manifests from compiled code, followed by deployment with ignored firebase.deploy.json files without shell hooks. Regenerate manifests after every build before future deployments.

Optional artifact deletion was rejected by automatic approval review, so no retention policy was enabled. Firebase CLI reported that the functions deployed successfully but returned a cleanup-policy error; Hosting was then published separately. This is not a function rollout failure.

Completed: user approved public HTTP transport for only the game browser endpoint. It is applied, and the normal connected Edge browser verified gameplay, reward settlement and next-game voting without a debug bypass. All three hub functions have ready:true for Push Your Luck. The hub policy was repaired to permit the documented reCAPTCHA connect path; App Check remains enforced. See RELEASE.md for evidence and limits.
