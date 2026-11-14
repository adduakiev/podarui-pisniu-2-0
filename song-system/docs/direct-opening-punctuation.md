# Direct contact-line trailing punctuation — author handoff

Base a13b5f566a5394efde3c92bfc0ce7ebf5fc675d8, tree a595b7fb0c4aec604fd042222792452c775d064d, fetched from GitHub. Existing opening fix is retained; this is a descendant. Direct confirmation/payment CTA and owner payment policy are unchanged.

Repro: `Хочу пісню для мами\nemail: first@example.test; телефон: +380501112233;`. Before: recipient remains Не вказано while opening and two contacts survive. The contact-line filter split at the final semicolon and tested the empty fragment as if it were prose, preventing removal of an otherwise structured contact line from the recipient-validation view.

Minimal runtime change: trim and discard empty separator fragments in that existing filter, and require at least one nonempty fragment before considering a line contact-only. Every nonempty fragment still must pass existing offeredContacts. Mixed prose/uncertain contact lines remain intact; negation split around contact lines remains connected. This is a temporary recipient-validation view, not a rewrite of opening/messages/evidence/contact data. No nickname, gender, contact-name inference added.

Author verification:
- Final tests run unchanged on a separate exact-base worktree:20 tests,4 PASS /16 FAIL, exit1 (`red-final-tests.log`). Initial red log also retained. A speculative mixed-prose negative fixture was clarified to a labelled contact-name case before this final baseline replay; runtime code was not widened to accommodate it.
- Candidate target matrix:20/20 PASS, exit0. Semicolon/no semicolon/repeated semicolon/trailing whitespace; LF/CRLF; both contact orders; signed UTF-8 and JSON Unicode escape bodies; byte-identical stored opening; source-message evidence; two contacts/provenance; duplicate webhook; mama↔grandmother corrections/history; producer/stop guards; negative and contact-name controls.
- Available full suite144/144 PASS, TypeScript PASS, production build PASS. Historical858 suite unavailable. Existing Direct confirmation/CTA tests included; files not changed.
- No live LLM/Meta requests, costs, customer sends, new browser run or production deployment. Fake interpreter/transport prove contracts, not real-model quality or Meta permission availability. Cloud persistence and source-identity-safe Direct→TG remain separate gates.

Reproduce from song-system:
```
node --import tsx --test tests/direct-punctuation.test.ts
node --import tsx --test tests/*.test.ts
npm run typecheck
NEXT_TELEMETRY_DISABLED=1 npm run build
```
Tests set LOCAL_ONLY and fresh temporary synthetic DBs; never point fixtures at live data. The baseline worktree shares installed dependencies only, not DB or modified runtime source.

Practice checked: retain original inbound and evidence while applying a narrow derived parsing view. Source: existing a13 contact-line implementation and cloud-environment-runtime guidance on repeatable boundary checks. Ukrainian signed opening is recovered byte-for-byte and its recipient fact points to the original message after punctuation normalization in the derived view. Reuse this preservation assertion for later text preprocessing.

Status ready_for_review, independent QA pending. No claims of full release readiness. Reviewer: compare against exact a13, run the matrix and existing Direct/guard suites, and verify the runtime diff is confined to offeredContacts fragment handling. No main/Notion/resource/live changes.
