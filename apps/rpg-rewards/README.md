# RPG Rewards

Released Google-account update (November 1, 2026): awards owned by a Google account persist across sessions and devices. Between Turns supplies verified account identity and a durable transfer outbox; Rewards updates guest award ownership in place, preserving document paths, IDs and consumption state. My Rewards can connect without an active session; Session History remains session-scoped. Functions/Hosting are deployed and the account-inventory index is READY. Real Google login and a stored account award were verified; the sibling hub's `docs/RELEASE-2026-11-01-GOOGLE.md` records evidence and limits. See [API additions](docs/API.md).

Rewards service and embedded pages for Between Turns. Between Turns owns identity, session membership, navigation, active game runs and inactivity expiry. Rewards selects an equally likely reward from the shared catalog when a game begins, records confirmed winners, and manages reward use.

Players open **My Rewards** and **Session History** from Between Turns. My Rewards supports owner-only use, a 15-second undo window, and a lock on other rewards during that window. Session History shows rewards and their winners, without usage status. Visiting Rewards directly points players to Between Turns; it does not initialize a separate login or offer session creation/joining.

## Integration

See [the API contract](docs/API.md) and [the implementation handoff](docs/integration/README.md).

Bingo's existing embedded backend calls `draw` at the start of each hub run and `settle` after its confirmed win review. Rewards settles all tied winners in one transaction and returns a durable receipt. Bingo reports completion to the hub only after settlement succeeds. Stable offer IDs and command receipts prevent duplicate awards across retries and restarts.

The implementation preserves the `centralSessions`, `centralConnections`, and receipt formats used by the integrated Rewards copy in Bingo's `integrations` directory. Existing central awards remain readable. Old standalone Rewards sessions are not imported. Legacy domain code remains solely for regression checks and cleanup; its player callable rejects standalone commands.

## Development and verification

Requirements: Node.js 22.12+, Java 21+, and Edge for browser tests. Sibling checkouts of `between-turns` and `rpg-bingo` are needed for cross-project integration tests. Set `RPG_PROJECTS_ROOT` if they are elsewhere.

```powershell
npm test
npm run build
npm run verify:emulators
npm run test:browser
```

Cross-project tests prepare isolated copies of sibling source files, apply the pending changes to those copies, and exercise the actual hub, Bingo, and Rewards services against separate emulator databases. Source checkouts are never changed by the test setup. Generated patches are saved in `docs/integration` for review. Browser tests use a local parent frame and mocked transport; the emulator tests cover real backend behavior.

```powershell
npm run emulators
# In another terminal:
npm run dev
```

The embedded development page expects a Between Turns parent at `http://127.0.0.1:5180`. The frontend proxies `/embeddedApi` to the Rewards Functions emulator at port 5101. Configure `BETWEEN_TURNS_API_URL` for a separately running hub when testing real HTTP handshakes. The old standalone sample game is a historical fixture and is not the integrated launch path.

## Deployment

Deployment is separate from implementation. Follow [deployment instructions](docs/DEPLOYMENT.md), including app registration, private service identities, Hosting frame policies and the browser endpoint's invocation configuration. Do not mark Bingo ready until all integrations are configured and verified.
