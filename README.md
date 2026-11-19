# Between Turns

Between Turns is the session hub. RPG Rewards tracks rewards and inventory. Each game owns its gameplay and state.

| Component | Source | Hosting target | Firestore database |
| --- | --- | --- | --- |
| Between Turns | `apps/hub` | `hub` | `(default)` |
| RPG Rewards | `apps/rpg-rewards` | `rpg-rewards` | `rpg-rewards` |
| RPG Bingo | `games/rpg-bingo` | `rpg-bingo` | `rpg-bingo` |
| Roll Race | `games/roll-race` | `roll-race` | `roll-race` |
| Push Your Luck | `games/push-your-luck` | `push-your-luck` | `push-your-luck` |
| Horse Race | `games/horse-race` | `horse-race` | `horse-race` |

## Local development

Use Node 22.12+ and Java 21+ for the Firebase emulators. Browser suites use Microsoft Edge and Bingo's layout check can also use Chrome.

```sh
npm run install:apps
npm run build
npm test
npm run verify:emulators
npm run verify:browser
```

Pass a component name, such as `npm run build -- horse-race`, to install, build, test, or run a component's integration or browser tests. The root emulator loads all six backends on the `demo-between-turns` project. Start it with `npm run emulators`. To run the hub's Vite development server, use `npm --prefix apps/hub run dev`.

## Deployment and new games

The production project is `between-turns-paul`. The hub stays on its existing URL. Review the [production migration runbook](docs/FIREBASE-MIGRATION.md) before applying deployments.

```sh
npm run deploy -- horse-race all --dry-run
npm run deploy -- rpg-rewards functions --dry-run
npm run deploy -- all data --dry-run
```

To add a game, create a directory under `games/` with its own frontend and Functions package. Add component scripts to `scripts/apps.json`, a codebase and unique function exports to `firebase.json`, and a Hosting target to `.firebaserc`. Use a named database with its own rules and indexes and grant its runtime access to that database. Add its origin and service account to the hub and Rewards registries through the runbook. Verify the game through the hub before marking it ready. Games communicate with the hub and Rewards via their HTTP contracts.
