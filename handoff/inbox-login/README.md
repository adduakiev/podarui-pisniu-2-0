# Login to CRM inbox: narrow author verification

Status: ready_for_review; independent QA must rerun. Exact base is `faa14e4f9932746b25f46299412982496a758b12`, tree `3f0f6d010ff70bd17430efd44beb6dc2c24e06fc`. This commit changes only `song-system/tests/inbox-mobile.cjs` and this evidence directory. Application, auth, cookies, CSRF/Origin checks and dependencies are byte-identical to the base. No runtime defect fix is claimed.

The prior author's mobile PASS was not confirmed by independent QA and is not accepted as closure. QA reported exit1 after login before the order list. That exact timeout did **not** reproduce here: the baseline helper with observation-only video/screenshots/HTTP-status logging exited0 (`baseline/`). The precise original QA locator/HTTP log has been requested; its root cause remains unknown. Do not label the following new helper mistake as the original QA defect.

While extending the helper to explicitly select a CRM row, a separate failure was captured (`helper-failure/`, exit1): it searched the order row for contact text, but the actual row displays name/recipient/occasion rather than contact. This helper locator was corrected to the index of the exact created order in the real authenticated orders response, then selected through the rendered UI. No direct API mutation or session injection replaces the UI interaction.

Final helper explicitly observes login POST200, authenticated orders GET200 containing the created ID, the logged-in UI, CRM row selection and visible notes, inbox navigation, the target select option and its matching detail response, takeover/resume, reload and separate Direct order selection. It records named stages and HTTP path/method/status without request bodies, cookies or auth headers. It captures failure screenshots/body text, videos and exit code. It creates owner authentication only by typing the synthetic password into the real login form. The existing customer intake and fake channel fixtures remain; no owner/session is preseeded.

Results:

- `baseline/`: observation-only original helper, exit0. This is a local observation, not confirmation of the prior independent failure.
- `helper-failure/`: new incorrect row locator, exit1; screenshot, text, log and video retained.
- `green/`: corrected complete UI flow, exit0, mobile390x844, no page errors or external requests.
- `delayed/`: same final flow with600ms delay before forwarding actual local API requests, exit0. No API responses were fabricated; login/session/cookie/Origin checks ran normally.
- Available suite85/85 and TypeScript PASS; CJS syntax check PASS. Build was not rerun because runtime/config/dependencies were unchanged; both browser runs served the existing base production build. Historical858suite is absent. Google Fonts/network/font rendering were not validated or bypassed.

Videos are valid WebM files; `videos.json` records ffprobe size/duration. Evidence contains synthetic data only. No DB, env file, credentials, real customer data or dependencies are included. The password visible in fixture source is the documented synthetic local test password, not a service credential.

Reproduce from `song-system`: build/start with the documented fresh isolated local fixture environment in `docs/crm-inbox.md`. Set `QA_BASE`, `QA_DATA` to that server's fresh database directory and `QA_EVIDENCE` to an empty writable evidence directory, then `node tests/inbox-mobile.cjs`. For the second run use another fresh database/server and add `QA_API_DELAY_MS=600`. Never use a live database. Playwright needs its ffmpeg executable for recording; this executor used installed `/usr/bin/ffmpeg` via a symlink at a private `PLAYWRIGHT_BROWSERS_PATH/ffmpeg-1011/ffmpeg-linux`, with Chromium explicitly `/usr/bin/chromium`. No download or network-policy bypass was used.

Source/practice: the cloud-environment-runtime skill's browser-testing guidance requires trying real browser execution and diagnosing specific failures. Here the Ukrainian synthetic flow records the exact stage and real HTTP outcome, preserving failures instead of reporting a blanket PASS. Reuse the stage/status/video diagnostics for future mobile gates.

Next action: independent QA reruns this exact commit and supplies the original timeout locator/status if it recurs. Author PASS is not independent QA closure. No new product feature, main, merge, production, live API/send, provisioning or Notion changes.
