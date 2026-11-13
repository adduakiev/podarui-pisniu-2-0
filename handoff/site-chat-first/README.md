# SITE chat-first author handoff

Status: ready_for_review, independent QA pending. Exact base `85d466b58d79af655f6f77d3e958f39fa0604350`, tree `9e6c6545757a1fad116e1d055ede3793fe9e2c91`. The review commit containing this file is the final source candidate. Scope: four app files, targeted tests/mobile fixture and evidence/docs. No lib/core/CRM/payment/storage/auth implementation changed.

Before: only testMode showed chat-first; the ordinary form required name/contact/recipient. Site POST directly inserted another Telegram code with no issuance expiry. Six targeted regressions failed on the unchanged baseline (including combined assertions blocked by missing opening-only normalization). After: six PASS, all available91 tests PASS, TypeScript/build PASS. This is author proof, not independent approval. Historical858suite remains unavailable.

Actual mobile production-build360x800 results, real local API/fake Telegram transport:

- `/`: question “Скільки коштує пісня?” creates one saved lead; web reply establishes mother recipient.
- `/pisnia-dlia-mamy`: “Хочу пісню для бабусі” then “Ні, для сестри” preserves explicit sister correction and original source_page.
- `/pisnia-na-den-narodzhennia`: explicit thanks/correction preserves “Подяка без приводу”, not the landing birthday default.
- All three: no required name/recipient field; optional contact; API request replay returns same order and Telegram URL; first message/reply appear once after reload; “Залишитися тут” persists; no premature payment link.
- Secure link from the actual UI binds fake Telegram to the same order; first message and context remain; duplicate update does not send twice; another chat and exact expiry boundary are rejected; total leads remain1/2/3 across the three scenarios. Paid remains0 and no lyrics task is created.
- WhatsApp is visibly manual, with no automatic history-transfer promise. No external browser requests/page errors/horizontal overflow. Screenshots and exact outcomes are adjacent.

Semantic boundary: the unchanged fallback parser treats the free-form synthetic Telegram memory as an occasion in the first two scenarios where occasion was still missing (visible in mobile.json). This slice does not improve that parser or claim live-LLM quality; the required original messages, recipient corrections, source attribution and order binding were preserved. The explicit gratitude case remains correct.

See `song-system/docs/site-chat-first.md` for behavior and reproduction. The UI is independent of LOCAL_ONLY; local storage is not. Form rendering with testMode=false passes under both flag values; real API-backed mobile tests intentionally use LOCAL_ONLY=1. The storage guard still rejects0. No cloud provisioning or deploy readiness is claimed.

Reusable practice/source: existing `lib/telegram-links.ts` is the single issuance/TTL/binding authority. The new endpoint regression checks expiry immediately after POST, retry reuse and exact boundary rejection; the Ukrainian mobile scenarios verify the actual issued link through the existing fake-transport adapter. Reuse these tests rather than duplicating token generation in routes. React best-practices review retained the existing browser ownership guard and confines channel preference to non-authoritative local UI state.

The preceding independent production UI login gate is scoped PASS per coordinator. Dev Webpack HMR navigation remains a separate unresolved risk; no new HMR cycles or changes were made in this slice. Google Fonts are not independently verified. No main/merge/deploy, live provider API/sends, production, payment settings or Notion edits. Next action: independent QA on the exact published review SHA/tree; cloud persistence remains a separate gate.
