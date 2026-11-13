# Inbox navigation diagnosis — gate remains OPEN

Status: **blocked on reproducing the independent normal-mode failure**, diagnostic candidate ready for QA. This is not a runtime fix or gate closure. Base: `6452d7f7fd28e847979724def76feb25270c79cb`, tree `130e8669cd68626524c3775df9dde25c08d4df26`. Only the browser helper and evidence change. Runtime, authentication, cookies, CSRF/Origin checks, dependencies and build configuration are identical to that base.

Preserved independent report (reported evidence, not a locally captured failure): “Normal exit1: login/orderselection PASS, натиск inbox → timeout30s, навігація назад /admin; delay600ms exit0.” The actual independent trace/log was not supplied to this executor; it has been requested. We cannot identify its cause or create a truthful local FAIL artifact from this report alone. Earlier author PASS does not override that report. No timeout was increased in this candidate.

Bounded local investigation:

| Run | Outcome | Scope |
| --- | --- | --- |
| prod-baseline | exit0 | exact baseline production runtime, observation-only helper |
| dev-baseline | exit0 | exact baseline Next dev in separate worktree |
| cycles | exit0 | production; initial flow plus12 fast UI back/order/inbox cycles, no pre-click screenshot pause |
| normal | exit0 | diagnostic candidate with explicit navigation assertions |
| delayed | exit0 | same candidate and assertions with600ms local API forwarding delay |

These observations do **not** establish the independent bug is fixed. No runtime change was justified. Dev initially could not start because Turbopack disallowed an out-of-root node_modules symlink; copying existing dependencies locally resolved that environment issue without source changes or network installation.

Evidence distinguishes hypotheses:

- DOM: actual anchor is `<a href="/admin/inbox">Вхідні повідомлення</a>`, outside any form. Captured pointerdown/up/click target and href agree in successful runs. Inbox controls and order-row buttons have native default type=submit, but are outside forms; their clicks produced no submit event. Only the real login form produced submit. No speculative button-type patch was made.
- Network: GET document `/admin/inbox` returned200, with no redirect chain or3xx response. Trace records method, resource type, status, redirect source/location and request failures. There is no application redirect back to `/admin` in these runs.
- Auth: login is the actual UI password form, POST200; subsequent requests carry an `admin_session` cookie. Its metadata is HttpOnly, SameSite Strict, path `/`; no cookie value is recorded. No owner/session preseed, forced navigation to inbox, auth bypass or direct owner API mutation was used.
- Navigation: frame navigation plus pageshow/pagehide/beforeunload and console events are recorded. Return-to-admin document requests occur only in the explicit back-link cycles, not in the asserted inbox transition. Captured submit, click and network events allow the next failing run to identify whether a wrong target, form submit, redirect, session failure or other navigation caused it.

Candidate assertions subscribe to the document response before clicking, verify exact href/outside-form placement, HTTP200/no redirect, matching order detail, final URL, a real inbox-link click, and no form submit or return-to-admin document request during the transition. This is diagnostic strengthening, not proof of a test race or application defect. `navigationContract` in normal/delayed results records the assertions. Trace URL queries are stripped and cookie values/headers/request bodies are omitted. Screenshots and JSON traces contain synthetic data only; videos are optional and were not required.

Reproduce with existing isolated fixture setup from `song-system/docs/crm-inbox.md`, a fresh DATA_DIR per run, real synthetic owner password login, `QA_BASE`, `QA_DATA`, `QA_EVIDENCE`, then `node tests/inbox-mobile.cjs`. Repeat on another fresh server/DB with `QA_API_DELAY_MS=600`. The unchanged30-second timeout is diagnostic only. Both modes must be run by independent QA. If normal fails, transfer `navigation-trace.json`, `inbox-mobile.json`, `exit-code.txt`, run.log and failure screenshots/body text, plus whether Next was dev or start. No private cookie value is needed.

Validation this turn: helper syntax PASS; normal/delayed UI assertions PASS locally. No new full-suite/TypeScript/build result is claimed: source/config/dependencies are unchanged from base; production used its existing build. Full historical858suite remains unavailable. Google Fonts and font rendering are not validated or bypassed. All browser requests outside the local fixture remain blocked; provider transports are injected fakes.

Primary-source practice: the installed Playwright `types/types.d.ts` waitForResponse example (also https://playwright.dev/docs/api/class-page#page-wait-for-response) registers the response promise before the action. Applied to the Ukrainian synthetic inbox flow, both normal/delayed runs captured the exact document200 and matching detail response. Reuse that causal assertion and the redacted DOM/navigation trace; do not replace them with sleeps or longer timeouts.

Next action/dependency: independent QA normal-mode rerun on this exact diagnostic commit; if failing, return its trace to establish the cause before any minimal runtime/test fix. No access denial occurred. The unresolved failure's cause is **uncertain**, not denied or fixed. No new features, provisioning, main, merge, deployment, production, live API/sends or Notion changes.
