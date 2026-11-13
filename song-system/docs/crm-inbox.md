# Owner inbox and contact provenance

Open `/admin/inbox` after owner login. `GET /api/inbox` lists order summaries; `GET /api/inbox?id=<uuid>` returns only that exact order, contact collection, channel events and its conversation history. A public chat token is not owner authorization. Responses are `no-store`. This single-owner application does not introduce a multi-tenant authorization model.

Contacts are additive records keyed by order/type/normalized value. Each retains source, channel, event ID, exact evidence, timestamp and (for a form) source page. Replays of the same event do not add duplicate evidence; another source appends provenance. Original `contact` and `channel` fields remain unchanged. Identical names never merge orders. `confirmed` means explicitly supplied, **not verified ownership**; `verified` is always false. No phone or real name is inferred from provider IDs or nicknames.

The structured order payload accepts `contacts: [{type, value}]` with email, phone, telegram or instagram type. Message intake accepts standalone email/international phone values, or clauses such as `Email: first@example.test; телефон: +380501234567; Telegram: @synthetic_inbox`. Separate clauses with semicolon/newline/comma. It deliberately does not mine arbitrary prose, third-party mentions or uncertain statements. Such text stays in the history/notes rather than becoming a confirmed contact. Unknown form contact text is preserved as `other`, unconfirmed. Existing contacts are projected as unconfirmed legacy evidence; historical prose is not silently reclassified.

Timeline events record receipt/preparation and the existing adapter's delivery state. `pending` is prepared but not started, `sending` has begun, `sent` means the transport returned success (not read or provider-confirmed exactly-once delivery), and `uncertain` must not be blindly resent. Site `response_prepared` does not assert that the browser received it. Job state accompanies outbound events. Recovery remains in `/admin/recovery`; this screen creates no new outbound send operation. Historical records without reliable channel/time show unknown metadata; the full conversation remains separately readable. Refresh explicitly reloads current state.

Takeover uses the existing shared order producer mode with revision checking, affecting bound site/Telegram/Direct processing. Resume preserves the customer's no-contact guard; it cannot revive a stopped conversation without separate consent. The local-only database guard remains required. No cloud persistence, paid resource, production migration or deployment is provided by this slice.

Verification: `node --import tsx --test tests/crm-inbox.test.ts`, full available `tests/*.test.ts`, `npm run typecheck`, `npm run build`. For the mobile fixture, start the built app with an empty environment plus PATH, `LOCAL_ONLY=1`, a fresh `DATA_DIR`, `OLENA_RESPONSES_ENABLED=0`, `ADMIN_PASSWORD=synthetic-only-password`, `SESSION_SECRET=synthetic-only-session-secret-for-offline-qa` and port 3125. Then run:

```
QA_BASE=http://127.0.0.1:3125 QA_DATA=<same-fresh-DATA_DIR> QA_EVIDENCE=<output-dir> node tests/inbox-mobile.cjs
```

The fixture uses Chromium/Playwright, blocks all external browser requests, uses injected fake Telegram/Direct transport, and creates only synthetic data. Do not point it at a live database. The historical 858-test suite is not in this sanitized checkout.
