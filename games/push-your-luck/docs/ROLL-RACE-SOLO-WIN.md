# Roll Race solo win window

Deployed to roll-race-paul and verified through the live Between Turns hub. A solo winning roll now starts a server-controlled 15-second review instead of immediate settlement. The page shows You won!, the offered reward name and benefit, and a countdown. Roll controls pause. Rewards are settled and hub completion is reported after the deadline. Solo undo stays disabled; multiplayer review and undo are preserved.

Validation: nine domain tests, five real-Firestore/service tests including the actual hub and Rewards integration, TypeScript checks and the production frontend build passed. A normal connected Edge browser completed a solo race: You won!, Steady Aim and a next-game countdown were visible; after the window the hub started a new vote and Steady Aim appeared in My Rewards. The temporary test session was left.

Both Roll Race functions are ACTIVE and the Hosting release succeeded. The browser endpoint retained its existing public transport setting. No hub catalog or Rewards registration changes were needed.

The Roll Race sibling checkout is outside this workspace's writable roots. Source changes were deployed from .deployment/roll-race. Apply docs/integration/roll-race-solo-win.patch to C:/GitHub/roll-race before its next source deployment so this change is retained. The patch includes source, README and timing-test updates and passes git apply --check --ignore-space-change against the current checkout.
