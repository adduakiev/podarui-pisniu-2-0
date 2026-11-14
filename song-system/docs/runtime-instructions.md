# Versioned manager instructions — scoped review

Base: fab86689a6ef00654b017d6c8219f0f5a8bfa45e / b223bf39f323f380cc86e77cd9796d7ff6e7767b.
Source: https://app.notion.com/p/415a24d433c58147ab73d88d7da5883d, fetched revision 2026-11-11T22:52:09.280Z. No Notion edits or personal archive retrieval.

## Runtime contract

`lib/olena-instructions.ts` retains the existing prompt and appends curated principles: respectful Ukrainian, empathy without assumptions, one useful gap (occasionally two related questions), known facts retained, optional Telegram, no invented payment/delivery/studio/refund claims. Backend business policy is authoritative. Military deferred payment requires explicit owner authorization and never represents received funds. The 48-hour policy starts from complete information, not an unverified model promise. No personal demo.

Bundle `olena-runtime-v1`, SHA256 `cc7f967dcb0933b2688c8c034e575796ce124600d4931882dabe5d545efe900e` hashes the UTF-8 `JSON.stringify(instructionBundle)` object in declared property order, including source/version/instructions. Updating any instruction changes the hash; reviewed releases must also version the bundle deliberately. Nothing is fetched from Notion at runtime.

Responses receives only the static bundle as `instructions`. Entire conversation context, including owner feedback references, remains JSON in one user-role input. `ownerReferences` contains original assistant message index, suggested replacement and reason from existing test-feedback state, separately from original messages. These are untrusted examples, never system instructions or authority to change payment/stop/handoff. No new feedback-write endpoint or permission is added.

`olenaDialogue` returns `turnMetadata` and existing `processInbound` stores it in `dialogue_inbound.result` and the recovery job result on completion across site/TG/Direct. Fields: bundleVersion, bundleHash, modelId, execution. modelId is `injected` for fixtures, configured model ID for Responses, null when not invoked. execution distinguishes not_invoked/injected/responses/fallback_error. It identifies invocation, not proof that the free-form proposal became the final reply: backend routing and safety filters still win. Retry reuses the saved receipt and metadata. Failed interpreter calls get fallback_error without error/credential text. A process killed before completing the result has no completed-turn metadata; this change does not add attempt tracing. Snapshot reads and legacy receipts need not have metadata. No historical backfill.

Luna/Terra/Sol selection remains explicitly configured through OLENA_MODEL_CANDIDATE and the matching OLENA_MODEL_* mapping. Astra remains disabled. No model selected and no enablement/API key changed in this work. Existing OLENA_RESPONSES_ENABLED/key gate and LOCAL_ONLY guard remain unchanged.

## Deliberate limits / follow-up findings

- Telegram refusal is durable **message evidence** in conversations.messages. The next interpreter context includes it. There is no new transfer_offered/transfer_declined event flag or exact-once suggestion gate; no such behavior is claimed. This prompt tells the model to respect saved evidence. Model compliance has not been evaluated live.
- Existing deterministic `conversation.ts:payment()` still describes all 1000 UAH formats as upfront payment, without using authorized deferred terms. Existing `answerQuestion()` also promises a full refund after revisions without an owner decision. These pre-existing policy-text discrepancies are not fixed by this bundle; require a separate narrow backend-response policy correction. This is not business-policy acceptance or release readiness.
- Prompt isolation proves transport/data boundaries, not immunity to all prompt injection or real-model quality. Existing backend guards remain necessary.
- Cloud persistence is still blocked on identification/configuration of an authorized empty staging target. No resources created or modified.

## Author proof and reproduction

`tests/runtime-instructions.test.ts`: seven synthetic tests cover bundle identity, fake Responses request boundary, provenance and owner reference separation, retry metadata, stored TG refusal evidence, false payment/delivery suppression, stop/handoff bypass, failure metadata, and matching TG/Direct receipts. No network LLM or real transport is used. The first baseline run failed on the missing bundle module (red.log); this is an absent-feature regression, not a claim that every new behavioral case failed on baseline.

Commands (LOCAL_ONLY tests create fresh synthetic temporary DBs):

```
node --import tsx --test tests/runtime-instructions.test.ts
npm run typecheck
node --import tsx --test tests/*.test.ts
NEXT_TELEMETRY_DISABLED=1 npm run build
```

Final author checks: TypeScript PASS; available suite 109/109 PASS; production build PASS. Historical 858-test suite is unavailable. No new browser run or live-model grading claimed. Existing source-to-inbound-to-persisted-result boundaries were checked through synthetic integration tests; UI is unchanged.

Practice checked: verification skill's boundary tracing applied to «Хочу пісню для бабусі» and saved owner correction. The fake interpreter saw original messages and explicit/provisional provenance; the serialized request kept reference text outside system instructions, and the persisted retry kept the bundle identity. Reuse this boundary contract for each candidate model's later separately authorized evaluation. Source: repository tests plus the cited Notion specification; no personal archives.

Status: ready_for_review for this scoped bundle; independent QA pending. Reviewer should verify the exact tree, seven fixture contracts, configured model gate, metadata retry semantics and the limitations above. No production/live sends/main/merge/deployment.
