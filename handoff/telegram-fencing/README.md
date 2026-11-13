# RECOVERY TG 01 author handoff

Status: ready_for_review, pending independent QA. Exact base: 7d2990c1dd69ec8bbe8fdf53812bff28eed8531d; tree2353405b61ef5ea1d2afc5920ee49f5a3b569b63.

Coordinator explicitly assigned this author to replace unavailable ca32ad0df243df3ddc4d09e417ca0d759f764c65 for this gate. No code or artifact from ca32 was obtained, cherry-picked or combined. If it becomes available, compare before considering any integration.

Runtime scope: only song-system/lib/telegram-inbound.ts. `claimedDelivery` remains an acquisition marker; the current persisted job token, state=sending and unexpired lease are checked inside the synchronous claim transaction before every transport call. A held first send does not authorize a second send after owner reconciliation. An incomplete batch with pending/sending items remains reviewable rather than being marked complete. Existing stop, revision, uncertain-delivery, payment and recovery-authorization code is retained.

Before/after: targeted regression on unchanged7d runtime had5FAIL/1PASS, including the exact hold-first-send -> expire -> ownerresolve -> release-old-worker repro. After the fix6/6PASS. Cases cover reconciliation, lease expiry, replaced token, uncertain/withheld state, replay without resend and a healthy multi-message batch.

All available75 tests PASS, including existing crash/restart, producer/stop, revision/order, payment and authorization tests. TypeScript/build PASS. Historical full858-test suite unavailable. UI/browser tests were not rerun for this transport-only change.

The separate natural-lease fixture waits for the real60-second lease, performs ownerresolve, releases the old fake sender, and asserts one transport call after retry with job state reconciled. Exact elapsed time and results are in natural-lease.json. Unlike the fast regressions it does not modify leaseUntil.

Reproduce from song-system:

    npm ci
    node --import tsx --test tests/telegram-fencing.test.ts
    node --import tsx --test tests/*.test.ts
    npm run typecheck
    NEXT_TELEMETRY_DISABLED=1 npm run build
    node --import tsx tests/fixtures/telegram-natural-lease.mts

All fixtures use temporary synthetic DBs and fake transport; no provider API or customer sends. An already-started request cannot be recalled, and this fix does not establish provider-confirmed exactly-once delivery. It prevents the stale worker from starting another request; it never resends a sent/uncertain item. Operator procedure remains in song-system/docs/crash-recovery.md.

Reusable practice/source: QA RECOVERY-TG-01 and the repository's beginDelivery contract demonstrate that acquisition is not continuing authority. Validate persisted fencing before each external side effect, not just at batch start; the Ukrainian synthetic scenario above verifies that invariant. Author PASS is not independent QA approval.

No main, merge, production, live API/sends or Notion changes. Source patch/bundle and the review branch are the handoff; independent QA is the next gate.
