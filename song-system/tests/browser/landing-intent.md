# Landing intent regression

Use a local build with LOCAL_ONLY=1, OLENA_RESPONSES_ENABLED=0 and
INSTAGRAM_DIRECT_ENABLED=0. Give the server a fresh, disposable DATA_DIR,
a fictional ADMIN_PASSWORD and SESSION_SECRET. Never use production or live APIs.

Run `npm run typecheck`, `node --import tsx --test tests/*.test.ts` and
`npm run build`, then start the local server on port 3110. In another shell:

```sh
BASE_URL=http://127.0.0.1:3110 \
DATA_DIR=/absolute/path/to/the/server/isolated-db \
ADMIN_PASSWORD=the-fictional-server-password \
QA_OUTPUT=/tmp/landing-results \
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_PATH=/usr/bin/chromium \
node tests/browser/landing-intent.cjs
```

The runner accepts localhost only, aborts nonlocal browser requests and uses four
fresh mobile contexts (390x844). It submits actual forms on both landing routes,
asserts initial/default intent, contradictory openings, natural corrections,
reload persistence, exactly one opening, source_page in request/storage/CRM,
original unconfirmed fact provenance, no premature payment and no page errors.
JSON and screenshots go to QA_OUTPUT. Requires Node with node:sqlite and
Playwright/Chromium; no application dependency is introduced.

source_page is an optional exact enum for /pisnia-dlia-mamy and
/pisnia-na-den-narodzhennia. Other paths, URLs and query strings are rejected.
It describes intake attribution, not a verified browser-origin claim.
The server derives landing_defaults from its own map, only for untouched default
values. Initial hints are unconfirmed facts with null message ID and page source;
explicit customer facts retain the previous hint in factHistory. Corrections do
not rewrite opening, source_page or landing_defaults. Existing leads without
source_page remain unchanged; their historical landing page cannot be recovered.
