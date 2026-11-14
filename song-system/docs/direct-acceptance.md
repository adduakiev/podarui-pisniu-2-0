# Direct synthetic acceptance and gap audit

Base: 2bc20c439cd585c1ba70d7aca1b5f50ddccf05e1, tree406aedd2cd0e9436625237e933b44bc0000ccb37. Fetched exact GitHub object; this branch descends from it and does not rewrite the independently reviewed payment-policy fix.

## Reproduction and narrow fix

Baseline signed synthetic webhook reached `canConfirm=true`, but «Підтверджую бриф» never set confirmed. Independently, a backend-confirmed brief with a configured payment link still produced only assistant text in Direct, omitting the link. `red.log`: 2 PASS / 2 FAIL for these two named gaps (DIRECT_BRIEF_CONFIRMATION_GAP, DIRECT_PAYMENT_CTA_GAP).

Fix: a strictly bounded text equivalent of the existing confirm action, «Підтверджую бриф» (optional terminal punctuation). Only an already reviewed ready brief or already confirmed brief can use it. The adapter captures the confirmation flag and snapshot in the same transaction as the durable inbound job, then passes the identical payload to processInbound. The core preserves the original consent message without mistaking it for another brief fact. Existing readiness/revision/lease/producer/stop guards still apply. Bare yes, quoted, negative or mixed consent does not authorize confirmation.

Direct replies now explain the explicit confirmation command when a summary is ready. After confirmation, the adapter adds only the existing backend-configured HTTPS payment link on confirmation or an inbound payment/link request. No model-generated URL is accepted, no payment is recorded, and no task is started by the CTA. It enters the existing persisted outbound/timeline and guarded send path. Replaying the same event sends nothing twice. New explicit requests can receive the configured link again. No spontaneous push when the owner edits the link, no new transport action or outbound job type.

## Actual author results

| Stage | Result | Boundary / evidence |
| --- | --- | --- |
| Signed Direct inbound → saved lead | PASS | Signed Request through production createInstagramWebhook with fake transport/interpreter; one order, original opening retained |
| Explicit contacts → provenance | PASS | Two emails and one phone retained from subsequent structured messages, Instagram source; identity is not inferred from sender ID |
| Context / reviewed brief | PASS, bounded | Synthetic supported fact proposals; complete sequential Ukrainian brief, no real model-quality claim |
| Direct brief confirmation | PASS after fix | Exact explicit command only after reviewed readiness; negative/quoted/mixed/premature cases do not approve |
| Verified/configured payment CTA in Direct | PASS after fix | Owner-configured HTTPS fixture URL in same-channel outbound, after consent; absent link is never invented |
| Owner HTTP authentication / authorization | PASS | Real local production server /api/session login200; /api/orders unauthenticatedGET401, unauthenticatedPATCH403, foreign-OriginPATCH403 |
| Test sum → one task | PASS | Real authenticated PATCH records100000 minor units; repeated command produces one receipt and one lyrics task, statusТекст. «Оплатив» alone leaves paid0 |
| TG refusal | PASS for persisted evidence only | Refusal remains in conversation messages; order channel remainsInstagram. No durable transfer-declined event or model-compliance claim |
| Producer handoff / stop | PASS | Producer state persists; later messages are saved without auto replies; stop persists and blocks confirmation send |
| Multiline opening recipient + contacts | FAIL / open scope gap | One opening «Хочу пісню для мами\nemail: first@example.test; телефон: +380501112233» retains opening and both contacts, but the injected explicit recipient update is rejected and recipient remainsНе вказано. Evidence validator normalizes newline into a space before clause matching. Not changed in this confirm/CTA patch. Separate reproducible direct-gap-probe.mts exits1 |
| Direct → TG continuation | UNSUPPORTED scope | No source-identity approval/binding implemented here; no unsafe transfer added |
| Live Meta permissions/configuration/delivery | NOT TESTED | No live calls, costs or customer sends; configured platform permissions unknown |

Final available suite:120/120 PASS, TypeScript PASS, production build PASS. This does not close full Direct acceptance because the multiline opening gap remains. Historical858 tests unavailable. No new browser run; owner endpoints exercised through real HTTP, signed webhook adapter through Request objects and fake send. No Meta webhook deployment/real transport tested.

Initial owner-HTTP fixture failed with the multiline opening. Its log is retained, and the passing HTTP fixture uses an initial recipient message followed by explicit contacts. The distinction is deliberate and is not a fix for the initial failure.

## Reproduce

```
node --import tsx --test tests/direct-acceptance.test.ts
node --import tsx --test tests/*.test.ts
npm run typecheck
NEXT_TELEMETRY_DISABLED=1 npm run build
```

For owner HTTP: start built Next on127.0.0.1:3147 with LOCAL_ONLY=1, a fresh DATA_DIR, OLENA_RESPONSES_ENABLED=0, SESSION_SECRET=synthetic-only-session-secret-for-direct-qa, ADMIN_PASSWORD=synthetic-only-direct-password, no live credentials. Run tests/direct-owner-http.mts with the same DATA_DIR/LOCAL_ONLY/SESSION_SECRET and QA_BASE=http://127.0.0.1:3147. Script logs in via /api/session; no forged/preseeded cookie. All transport is injected fake. Never point it at a live DB. It is intentionally a fresh-DB fixture, not repeatable against its previous data.

Open-gap probe: `node --import tsx tests/direct-gap-probe.mts` uses its own temporary DB and intentionally exits1 while the multiline recipient defect exists. It is excluded from the passing *.test.ts suite; do not report it as PASS.

Source/practice: repository's actual channel adapter, core confirmation gate, owner APIs, and cloud-environment-runtime skill's boundary verification. Ukrainian synthetic consent exercised inbound→persisted job→backend confirmation→outbound→owner receipt. Reuse the same explicit gate, rather than allowing model text to assert consent/payment. Instruction bundle and owner payment policy remain inherited from exact base. No personal archives.

Independent review pending. Cloud DB choice/persistence remains blocked separately. No main/production/Notion/cloud resource changes or deploy. Next action: independent QA of confirmation/CTA patch; separately address the documented multiline fact-validation gap before claiming complete Direct acceptance. Direct→TG requires a separately reviewed source-identity binding contract.
