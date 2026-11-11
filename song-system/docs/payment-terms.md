# Payment terms and the lyrics work gate

Scope: local isolated CRM, sanitized candidate 455cb132. No transport, production persistence, live model selection, generation or real payment integration is added.

Authenticated owner PATCH /api/orders accepts a UUID `commandId`, `confirmTerms`, optional `termsMode` (`standard`, `full_prepayment`, `owner_deferred`) and `deferPaymentReason`. The actor comes from the authenticated route; JSON cannot supply it. `completeBrief` remains the owner's confirmation that the brief is complete. Terms confirmation is distinct from brief completion and receipt of money.

- Standard story: total 200000 UAH minor units, required 100000 before start, remainder due after song sent. Own text and military: total/required 100000.
- Full prepayment: the full order amount is required before start.
- Military only: the owner can explicitly allow payment after song sent, with a reason. Persisted terms include actor, timestamp, reason, required_before_start=0 and balance_due_trigger=song_sent. This never inserts a payment or changes paid.
- Agreed terms cannot silently change; a different mode returns TERMS_REVIEW_REQUIRED. A changed order amount invalidates eligibility. Renegotiation/versioning is a later explicit workflow.
- `paid` comes from the immutable payments ledger. Currency, actor and unique command ID for new receipts live in additive payment_metadata. Historical receipts are retained without inventing actor/command metadata.
- A single transaction checks revision, records payment/terms, inserts a unique `(orderId, lyrics, 1)` task, updates order and audit and stores the command result. Same command+payload returns the committed result before checking stale revision. Changed reuse fails. Distinct concurrent commands on one revision conflict; caller must reload before issuing another intentional operation.
- The task is created only on an authorized start transition to Текст. It persists a brief/terms snapshot, due date, pending state and owner assignee. No automatic text generation occurs. Legacy delivered/completed orders never acquire a new task merely by being edited.
- Existing orders without terms receive provisional standard terms on read, not invented agreement. To start intake work an owner must confirm terms. Existing advanced orders remain readable/editable; no speculative task backfill. Existing brief timestamps and their 48-hour deadline are retained.
- Producer lock, no-contact, source attribution and opening history are preserved. The CRM action does not send any customer message.

## Offline verification

From song-system (Node >=24):

```
npm ci
node --import tsx --test tests/*.test.ts
npm run typecheck
NEXT_TELEMETRY_DISABLED=1 npm run build
```

The transferred snapshot contains only 27 bounded baseline tests, not the historical complete suite. The payment tests add 16 tests, including real concurrent Node processes, old-schema migration, rollback and no-backfill regressions.

For mobile QA, use a fresh synthetic DATA_DIR and no live environment credentials. Start `npm run start -- --port 3118` with LOCAL_ONLY=1, ADMIN_PASSWORD=synthetic-only-password, SESSION_SECRET=synthetic-only-session-secret-for-offline-qa. Then run `node tests/payment-mobile.cjs` with QA_EVIDENCE pointing to an existing output directory, PLAYWRIGHT_MODULE pointing to an installed Playwright package, and optionally CHROMIUM_PATH and QA_BASE. Browser requests outside QA_BASE are blocked. Each run expects a fresh database. The fixture tests military deferral at paid=0 and story fake partial payment, reload, command replay and unauthenticated PATCH rejection. Fake receipts must never be used against a real DB.

Practice reused: Next.js bundled forms guide recommends verifying authorization on the server even when UI is authenticated. Applied at the PATCH boundary and verified with a separate unauthenticated mobile browser context (403); do not infer owner authorization from a client field or model output.
