# Dedicated Horse Race deployment

Updated November 18, 2026. This supersedes the rejected shared-project proposal. Never deploy Horse Race into Roll Race infrastructure or grant its runtime access to Roll Race data.

## Confirmed status and billing boundary

Implementation remains local. On November 18, 2026, this task created the dedicated Google Cloud project `horse-race-paul` with display name `Horse Race` and enabled Firebase. Read-only verification at 2026-11-19T02:09:39Z (November 18 in America/Chicago) confirmed both project states ACTIVE, `billingEnabled: false`, and no linked billing account. Evidence is saved outside Git in `.ops/unbilled-project-result.json`.

No billing changes, runtime service account/IAM grants, cross-project access, Firestore database creation, game service deployments, app registrations or Hosting releases were performed. Roll Race infrastructure and data remain untouched. The previous inaccessible/unknown-project status is superseded by this successful creation and readback.

Official documentation checked November 18:

- [Functions deployment requirements](https://firebase.google.com/docs/functions/get-started): local emulation is available without Blaze, but production Functions deployment requires Blaze. This includes the implemented Functions v2 HTTP endpoint and scheduled backend.
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans): Blaze requires a linked Cloud Billing account. Linking billing upgrades Spark to Blaze. Free usage allowances do not waive that requirement or guarantee zero charges.
- [Scheduled functions](https://firebase.google.com/docs/functions/schedule-functions): `onSchedule` uses Cloud Scheduler. The documented job price is $0.10/month with three jobs per Google account at no charge; available allowance for this account has not been established. Function, Firestore, build/artifact and Hosting usage may also incur charges.

Paul subsequently explicitly authorized linking this dedicated project to an appropriate existing billing account. Read-only selection established exactly one open account, Firebase Payment, also used by both Between Turns and RPG Rewards. The linkage request was rejected by Google with HTTP 400 FAILED_PRECONDITION and google.rpc.QuotaFailure: Cloud billing quota exceeded. Readback at 2026-11-19T02:12:36Z confirmed billingEnabled=false and no linked account. Therefore Blaze/backend deployment is still blocked. Evidence is in ignored .ops/billing-selection.json and .ops/billing-link-failure.json. The documented next step is the Google billing quota increase form: https://support.google.com/code/contact/billing_quota_increase . No request has been submitted. Do not create another billing account, alter payment methods, change billing on other projects, or use another game's project as a workaround. Creating an unbilled project or removing the scheduler cannot resolve the HTTP Functions Blaze requirement.

## Dedicated resources

| Item | Exact target |
|---|---|
| Firebase/Google Cloud project | `horse-race-paul` (created and verified ACTIVE) |
| Region | `us-central1` |
| Hosting site | `horse-race-paul` |
| Intended URL | `https://horse-race-paul.web.app/embed` (not a verified live deployment) |
| Functions codebase | `horse-race` |
| HTTP function / Cloud Run service | `horseRaceApi` / `horseraceapi`, maximum three instances |
| Scheduled function / service | `maintainHorseRaces` / `maintainhorseraces`, every minute, maximum one instance |
| Database | Horse Race project's own default Firestore database; `horseRaces` and `horseConnections` collections |
| Runtime principal | `horse-race-runtime@horse-race-paul.iam.gserviceaccount.com` |

`firebase.json` and `.firebaserc` target this dedicated project. Copy `functions/.env.example` to ignored `functions/.env.horse-race-paul` only once the real project/runtime are ready. The shared-project config has been removed. `firestore.rules` denies browser database access.

## Exactly scoped application permissions

No grants have been applied. These are the intended settings for approval review against actual project state:

| Principal | Role/setting | Exact resource scope |
|---|---|---|
| Horse Race runtime above | `roles/datastore.user` | Only project `horse-race-paul`, containing its own database. No database role in any other project. |
| Horse Race runtime above | `roles/run.invoker` | Only `projects/between-turns-paul/locations/us-central1/services/integrationapi`; preserve existing invokers and private access. |
| Horse Race runtime above | `roles/run.invoker` | Only `projects/rpg-rewards-paul/locations/us-central1/services/gameapi`; preserve existing invokers and private access. |
| Horse Race runtime above | `roles/run.invoker` | Its own `projects/horse-race-paul/locations/us-central1/services/maintainhorseraces` for authenticated scheduler invocation. |
| Browser callers | `run.googleapis.com/invoker-iam-disabled=true` | Only Horse Race's own `horseraceapi` HTTP transport. The handler still enforces hub-bound opaque credentials and the exact browser origin. |

The only cross-project application permissions are the two private HTTP invoker grants above. This describes IAM scope, not an outbound network firewall. Firebase-managed build/service agents may require standard same-project permissions. Inspect existing deployer/runtime impersonation access first; report any additional exact missing permission before changing it. Do not add broad cross-project roles or alter organization policy.

## Application registration

Merge into the hub's live `APPS_JSON`, preserving current entries:

```json
{"id":"horse-race","kind":"game","origin":"https://horse-race-paul.web.app","serviceAccount":"horse-race-runtime@horse-race-paul.iam.gserviceaccount.com"}
```

Add game four to `GAMES_JSON` only once the endpoint/integration are ready:

```json
{"id":"horse-race","name":"Horse Race","description":"Four lucky numbers per player. Every table d20 roll can move several horses toward ten hits.","ready":true,"embedUrl":"https://horse-race-paul.web.app/embed"}
```

Merge into Rewards `GAME_CLIENTS_JSON`:

```json
{"horse-race":{"serviceAccount":"horse-race-runtime@horse-race-paul.iam.gserviceaccount.com","redirectUris":[]}}
```

Read all live registry versions first. The November 15 inspection found newer Push Your Luck entries on some functions than others; never overwrite with stale checkout values. The hub's deployed source inspected then already provided the full roster; local source mirrors those context fields. No new hub game-logic deployment should be needed. Preserve current live compiled assets, the three/two/one-column lobby, Google sign-in/guest continuity and all security directives; add only the exact Horse Race origin to `frame-src`. Do not redeploy the older checkout wholesale.

## Remaining steps and stop conditions

1. Dedicated project creation and Firebase enablement are complete. Authentication and access are confirmed. Its billing is disabled and no billing account is linked.
2. Functions deployment is stopped because Google rejected the authorized billing linkage with a Cloud Billing quota error. Resolve that account quota through Google, then retry only the already authorized dedicated-project linkage and verify billingEnabled and account identity. Do not alter any other project or payment method.
3. If the dedicated project is already suitable, review the exact scoped settings above against current state. Create only missing authorized non-billing resources; security mutations must satisfy approval review. Deploy Horse Race using `firebase.json` and explicit project `horse-race-paul`.
4. Merge registrations, preserve private API IAM, add the hub frame origin using current live assets, and sync ignored local env files from final readback.
5. Verify live multiplayer/full-roster scoring, tied winners, one reward each, account ownership, history, next-game transition, refresh, late join, departure and expired credentials. Report actual deployment URLs and limitations; local tests are not a live release.

## Local validation on November 18

All 13 rule/configuration tests and the production build passed. Functions and Hosting predeploy hooks run scripts/check-project.mjs and reject any selected project other than horse-race-paul, including Roll Race, Between Turns and Rewards. The previous seven emulator integration tests and browser checks passed on November 15; they were not rerun for this configuration/documentation-only revision. Firebase CLI reauthentication was subsequently confirmed by successful read-only project listings. No gameplay authentication or game deployment was completed. The dedicated unbilled project was subsequently created and Firebase enabled as recorded above.




