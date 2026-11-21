# Game-specific reward lists

**Deployed implementation:** `.consolidation/apps/hub` in the unified `between-turns-paul` application. The separate-app design below is historical. Deployment used the existing callable, shared transactions and local game modules, with no retired project deployments. See `.consolidation/docs/RELEASE-2026-11-19-UNIFIED.md` for verified release evidence.

Between Turns pins a reward-list reference when a mini-game run starts. RPG Rewards owns private libraries and immutable session snapshots. The initial general list is **Starfinder 2E — General List**; users may create lists for any RPG or edition.

## Behavior

- Any member can select a general list. Google users can also select, copy, and edit their own lists. General lists are read-only. Source libraries are private, even when their contents are selected for shared play.
- Everyone in a live session can inspect its current and queued snapshots. Source edits require selecting the source again. A selection during play affects the next run, including when no offer has yet been drawn for the current run.
- Rewards carry their complete effect and original RPG/list metadata. A session's inventory and use commands accept rewards matching the current run's RPG; the account view groups all saved rewards by RPG. Legacy rewards belong to the Starfinder general list.
- Lists require 1–100 rewards. RPG/list/reward names allow 100 characters and effects allow 2,000. Games use normalized, case-insensitive RPG names, preserving editions. Rewards remain single-use with the existing undo window.

## Trusted integration additions

`selectRewardList` is accepted only from the registered Rewards backend. It requires `sessionId`, `playerId`, `accountId` (or null for a guest), an idempotent `eventId`, and `rewardList` metadata: `snapshotId`, `sourceListId`, `rpgId`, `rpgName`, `listName`. It revalidates membership and identity, updates `selectedRewardList`, and leaves the current run unchanged.

Session views expose `selectedRewardList`; runs store `rewardList`. Connection contexts expose the selection and the current run's pinned `rewardList`, including for Rewards connections with null `runId`. Missing metadata defaults to the original general list, independently for legacy runs and sessions.

`rewardSessionStatus` is Rewards-only and returns `{ active, expiresAt }` for a session, including missing/closed sessions. Rewards maintenance uses this to renew snapshot retention after activity or remove snapshots after session expiry. This read never extends activity.

## Release preparation

Implementation and local validation do not deploy services. Preserve existing source changes, production assets, registries, CSP, runtime identities, and private invocation permissions.

1. Inspect the deployed configuration and reconcile it with the working copies before preparing production artifacts. Do not deploy an older hub checkout wholesale.
2. Release the compatible effect readers for RPG Bingo, Push Your Luck, Roll Race, Horse Race (where deployed), and RPG Rewards. They accept full `effect` text and fall back to legacy qualifying-roll text.
3. Deploy the Rewards snapshot collection-group index and wait for readiness, then the Rewards backend and hub backend additions. Keep the selection UI unreleased until both endpoints support selection. Retain all existing game registrations and service-scoped permissions.
4. Release the Rewards editor/library and hub navigation. Verify Google sign-in, guest selection, an owner-authored list, a mid-run switch, a completed game, reward use/undo, account inventory, and source privacy with separate accounts.
5. Check Cloud Run private invoker settings after a hub deployment. Roll back UI first if necessary; keep compatible readers and backend data support so existing custom rewards remain readable.
