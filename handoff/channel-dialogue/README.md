# Channel dialogue author evidence

Base commit: 1b76e40f4d0fe72164eabfbae6e4d0c3c3b50509; tree d8f386c01ec90bbbfcb3613552bff578a080b8f1.

The source code, tests and these synthetic logs are in the same review branch. The exact final SHA/tree is provided in the author handoff (Git cannot embed its own final hash).

- red.log reproduces baseline Direct bypassing injected interpreter: 0 calls instead of 1.
- red-snapshot.log reproduces the intermediate concurrent-opening duplicate: 2 user records instead of 1. The final regression asserts exactly one.
- tests.log: all available 57 tests pass, including 14 channel-specific cases. The historical 858-test suite is unavailable.
- typecheck.log and build.log: pass. The first worktree build rejected an external node_modules symlink; dependencies were installed locally with npm ci, then the final build passed.
- mobile-results.json: final mobile Chromium fixture with isolated DB and empty server environment, military deferred paid=0 and story fake partial payment. No external API requests or client sends.

Run from song-system: npm ci; node --import tsx --test tests/*.test.ts; npm run typecheck; NEXT_TELEMETRY_DISABLED=1 npm run build. Detailed behavior and model configuration are in song-system/docs/channel-dialogue.md. Existing mobile instructions are in song-system/docs/payment-terms.md.

Only synthetic data is included. No .env, credentials, database, dependencies or real customer messages. Independent QA is still required. Model choice remains explicit configuration; no live rollout. Claims interrupted by a process crash require reconciliation rather than automatic resend; live transport quality and crash recovery remain separate release gates.
