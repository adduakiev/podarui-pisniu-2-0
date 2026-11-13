# Crash recovery author handoff

Status: ready_for_review; independent QA required. Exact source base: 6a3740653257777d7a4f9bd7278cdcf9cb4a9da3, tree fe028952a8d7d59a28267f6f1c230ed0b322d9c2. The final commit/tree is the containing Git commit (reported separately to avoid a self-referential hash).

The owner now has `/admin/recovery` for durable pending/expired events. Operator procedure: [crash-recovery.md](../../song-system/docs/crash-recovery.md). Recover is allowed only before send and after the persisted lease expires. It produces a review result without invoking channel transport. Sending/uncertain cannot be resent here; only evidence-backed owner reconciliation is recorded. One active claim and fencing protect delayed workers. Reconcile has server authorization, same-origin check, reason, command ID and audit.

Actual author results:

- All available 69 tests PASS (57 previous +12 recovery); TypeScript and Next build PASS.
- Actual SIGKILL inside the interpreter for site/TG/Direct, followed by fresh OS-process recovery and retry; original inbound and one CRM lead retained, no payment/task duplicates.
- Actual SIGKILL inside fake TG/Direct send; recovery rejected and retry did not send again.
- Two real recovery processes cannot both acquire the same lease. Superseded live worker cannot commit. Producer/stop/revision/successor routing suppress stale recovery.
- `baseline-red-green.json` was produced against exact6a: site remained INBOUND_IN_PROGRESS, Telegram needsReview, Direct returned200 with no send; the new code recovered those same persisted receipts to ready_for_operator.
- Actual mobile Chromium390x844: real Direct kill, expired fixture lease, unauthenticated POST403, owner recover, reload and manual resolve; one lead, zero payments/lyrics tasks/sent receipts, two owner audit entries, no external browser requests/page errors.

Lease deadline was advanced in the isolated synthetic fixtures after actual SIGKILL to represent expiry. No wall-clock60second lease-wait claim. No live model or transport calls. No provider-confirmed exactly-once delivery claim. Completed transport and recipient delivery are distinct. The historical full858-test suite is unavailable.

Replay: from song-system, npm ci; node --import tsx --test tests/*.test.ts; npm run typecheck; NEXT_TELEMETRY_DISABLED=1 npm run build. The operator doc includes mobile fixture/server setup. The baseline replay fixture takes an existing exact6a song-system checkout; it never modifies it and uses new temporary DBs. Do not use any fixture against production.

All included evidence is synthetic. No .env, real credentials, live database, dependencies or customer messages. No main/merge/deploy/Notion changes. Independent reviewer should focus on lease takeover fencing, legacy visibility, sending-versus-processing distinction, authorization and active-retry races.

Reusable practice/source: Next.js bundled forms guide requires server-side authorization even behind authenticated UI. Verified by synthetic Ukrainian inbound+POST403; reuse the same boundary and idempotent command IDs for future operator actions.
