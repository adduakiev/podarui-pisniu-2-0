# Operator recovery of interrupted inbound events

Base: 6a3740653257777d7a4f9bd7278cdcf9cb4a9da3 / fe028952a8d7d59a28267f6f1c230ed0b322d9c2.

## Operator procedure

1. Sign into CRM as the owner. Open **Незавершені повідомлення** at `/admin/recovery`.
2. Check channel, immutable inbound/event ID, original order and message, state and lease. The lease is persisted for 60 seconds. Refresh after it expires; an active lease cannot be taken over or resolved.
3. For `pending`, expired `processing`, or `prepared`, enter the reason and select **Відновити обробку без відправки**. The server atomically claims one retry and fences the old worker. `prepared` uses the saved result rather than calling the interpreter again. Processing retries retain the original reservation/revision and request ID.
4. `ready_for_operator` contains a result for manual review. Check current CRM status and contact permission before any separate manual action. This feature does not invoke Telegram/Meta transport. A site client retry can read its recovered conversation; no push is sent. `withheld` means the result is stale or the order is locked/stopped/changed; do not use it as a current customer reply.
5. For `sending` or `uncertain`, **recover/resend is forbidden**. Inspect the provider conversation and local history independently. After the lease expires, record the evidence/outcome in the reason field and select **Позначити звіреним вручну**. This records owner reconciliation; it does not create a delivery receipt or send anything.
6. Record the manual review outcome for a ready/withheld result in the same way. `reconciled` jobs leave the unfinished queue; actor, timestamp, reason and command ID remain in `inbound_jobs.history`.

There is no automatic background resend or automatic exactly-once delivery claim. Provider success, uncertain delivery and owner reconciliation are distinct facts. `completed` means the site result was persisted or transport returned successfully; it is not proof that a recipient read/received a song. Expired `sending` is still unsafe to resend even if the process is known dead.

## Storage and boundaries

`inbound_jobs` is additive: original channel/event/order/input, original revision, state, token, leaseUntil, attempts, result and history. Adapter jobs are persisted before the first await. Existing `dialogue_inbound`, Instagram receipts/payloads and Telegram outbox remain intact. Legacy interrupted common receipts import their original reservation revision. Unknown legacy revision/binding is handled conservatively, never inferred as permission to replay. Legacy sending/uncertain receipts become review-only entries.

Owner-only `/api/inbound-recovery` GET/POST checks session; POST also checks same-origin. User-supplied actor is not accepted. Recover/resolve uses a UUID command ID; matching replays do not start another attempt. Wrong reuse and active leases fail. No transaction spans model or transport await. A worker must hold its current token and unexpired lease at conversation commit and before preparing/sending a transport reply. A superseded worker cannot commit a fallback after its model returns.

Recovery does not modify payment receipts or lyrics tasks. It does not reset producer/no-contact, bypass revision/order routing or move stale input into a successor order. It does not change existing model-selection/transport configuration.

## Author verification

- Available suite: 69 tests (57 previous +12 recovery), including actual SIGKILL inside interpreter for all 3 channels and inside fake send for TG/Direct, each followed by a new OS process.
- One active recovery lease is also checked with two separate OS processes. Old live-worker completion is rejected after takeover.
- Tests advance the persisted lease deadline to simulate elapsed time after an actual kill; they do not claim a wall-clock 60-second waiting test.
- Baseline script `node tests/fixtures/baseline-crash.cjs /path/to/exact-6a/song-system /tmp/proof.json` reproduces baseline hangs and verifies migration/recovery with the new source. Never run against a real database.
- `node --import tsx --test tests/*.test.ts`, `npm run typecheck`, `NEXT_TELEMETRY_DISABLED=1 npm run build`.
- Mobile fixture: fresh synthetic DATA_DIR, LOCAL_ONLY=1, ADMIN_PASSWORD=synthetic-only-password, SESSION_SECRET=synthetic-only-session-secret-for-offline-qa; start the built app on port3123 with otherwise empty environment. Run `QA_BASE=http://127.0.0.1:3123 QA_DATA=<same fresh DATA_DIR> QA_EVIDENCE=<existing evidence directory> node tests/recovery-mobile.cjs`. It performs a real Direct interpreter kill, synthetic lease expiry, unauthenticated403, owner recovery, reload and manual resolve. Playwright/Chromium locations can be set with PLAYWRIGHT_MODULE/CHROMIUM_PATH.

Reusable practice: server authorization is checked even for an authenticated UI (Next.js bundled forms guide, and React best-practices server-auth-actions). Verified with the synthetic Ukrainian inbound and unauthenticated POST403; repeat the same boundary for future operator actions. Fencing extends the existing conversation reservation and outbox contracts; leases alone do not establish exactly-once delivery.

Historical full 858-test suite is unavailable. All transport/model tests are injected/fake. No production, real customer sends, live API or Notion changes. Independent QA must verify this gate before release approval.
