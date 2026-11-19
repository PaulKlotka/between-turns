# Google authentication release — November 1, 2026

Released to all three existing Firebase projects:

- [Between Turns](https://between-turns-paul.web.app/): authentication, identity mapping, reward-transfer outbox, account-only Rewards grants, Google names/photos and frontend.
- [RPG Bingo](https://rpg-bingo-paul.web.app/): verified hub profile integration and identity-bound iframe connections.
- [RPG Rewards](https://rpg-rewards-paul.web.app/): permanent account inventory, in-place ownership transfer, cross-session use/undo locking and the account inventory index.

## Live readback

All 12 deployed functions are ACTIVE, all five maintenance/cleanup schedules are ENABLED, all three Hosting sites return HTTP 200, and the `awards.accountId` collection-group index is READY. The existing live Bingo catalog and Rewards registration were read from production and preserved before deployment; the stale empty local hub overrides were replaced.

The dedicated hub runtime has Firebase Authentication Viewer access for trusted Google provider profile reads. Browser endpoints retain application authentication; private integration endpoints retain scoped backend IAM. Unauthenticated embedded requests returned 401; unauthenticated private integration calls returned 403. App Check enforcement was not reduced.

Google is enabled and the live OAuth authorization endpoint accepts `https://between-turns-paul.web.app/__/auth/handler`. The original Firebase-domain callback remains configured. Production Hosting now permits Google's `apis.google.com` authentication script and same-origin auth helper iframe. A Chromium test using the actual production policy verifies both helpers load while unrelated scripts remain blocked. This corrects the initial live `auth/internal-error`, which local Vite/emulator tests did not expose because Vite does not apply Hosting headers.

## Account verification

Paul completed real Google sign-in in the deployed app. Read-only browser checks confirmed:

- Google account name displayed in both the hub and Bingo.
- Google profile photo present and successfully loaded.
- Guest name entry hidden for the account.
- Existing session and all 25 Bingo card values retained; no gameplay moves made.
- My Rewards connected to the account inventory and displayed a saved award.

A targeted read of that account's stored awards found one account-owned award, its original deterministic award ID intact, and no duplicate offer/player award records. No reward was consumed or changed during verification.

Isolated automated live browser profiles were rejected by reCAPTCHA/App Check, so the full two-guest automated live-game smoke test was not completed. The actual normal browser session and real Google/account/Rewards flow above were checked instead. Full session-expiry, retry/race and cross-device scenarios retain the emulator validation recorded in [authentication](AUTHENTICATION.md); no live session was forcibly expired for testing.

Sanitized local release readbacks are saved under ignored `.firebase-config/release-final.json` and `.firebase-config/live-account-rewards.json`. No OAuth client secret or authentication token is included in these reports.
