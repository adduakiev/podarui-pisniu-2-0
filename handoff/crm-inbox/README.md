# CRM inbox author handoff

Status: ready_for_review, pending independent QA. Base commit `be540303effa1a562b60ee4a7a58ee67c0257bb8`, tree `16ffd9eedd05fc6ef7e72e240a47d3fefe998d50`. The commit containing this file is the review candidate; obtain its exact SHA/tree with `git show -s --format='%H %T' HEAD`.

Baseline inspection found only single contact/channel fields and no owner inbox. This slice adds owner-only exact-order history, channel/timestamps and existing delivery states; additive contact/provenance records; a mobile owner view; and takeover/resume through the existing shared producer/no-contact guard. No outbound sending control was added. Details and reproduction instructions: `song-system/docs/crm-inbox.md`.

Author checks: targeted 10/10 and full available 85/85 tests, TypeScript and production build PASS. Existing crash/restart, recovery authorization, fencing, payment, binding and producer tests remain included. The historical full 858-test suite is unavailable. No live LLM/provider calls were made. Mobile Chromium 390x844: public form -> additional contact -> site/TG history -> uncertain fake TG delivery -> owner inbox -> takeover/resume -> reload -> separate Direct sent receipt PASS. Client inbox access403; HTML-like contact escaped without execution; all five site/TG contacts visible; no cross-order contact leak, horizontal overflow, browser errors or external requests. Machine results and screenshot are adjacent.

The first browser attempt exposed an inaccessible exact selector name. An explicit aria-label and long-contact wrapping corrected it before the successful run. Structured email clauses containing trailing prose are rejected rather than partially mined. Existing unclassified text remains visible, never silently verified.

Reusable practice/source: `vercel:react-best-practices` server-auth-actions and React text rendering. The Ukrainian synthetic form/contact scenario verifies that owner authorization is enforced on the endpoint (403 for the customer) and supplied markup stays literal text. Retain this fixture when extending inbox controls. Preserve generation checking on order selection so a late fetch cannot replace the currently selected order.

Review focus: additive schema compatibility, conservative contact grammar and provenance, exact-order separation, legacy unknown timestamps, actual adapter-state projection, takeover/stop guards. Local-only storage remains required; this is not deployment readiness. Independent QA is the next gate. No main/merge/production/Notion/live sends changes.

Transfer: use the exact GitHub commit on `codex/crm-inbox-review`, not a moving branch after review begins. The separately supplied binary patch is based on the exact base above; apply with `git apply --index` in an isolated checkout and compare `git write-tree` to the reported final tree. The bundle also preserves source history. Excluded: DBs, credentials, environment files, dependencies and real customer records.
