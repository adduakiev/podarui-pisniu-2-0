# Private cloud development

## Included
Current application source, dependency lockfile, tests, curated operating documentation, and uncommitted Olena improvements from the local checkout. Source baseline: 232534c235292fa63173ac995d17a38000974bb2, plus the current working-tree changes. Original source and Git history are preserved locally before this export.

## Excluded
No .env.local, admin password, session secret, Telegram token, SQLite database/WAL, uploads, screenshots, node_modules, .next, website_import, Telegram archive, or raw Git history is uploaded. Real review/story content in two JSON files is replaced by explicitly synthetic fixtures. Public business contacts in the source are retained.

## Development environment
Use Node.js 24 or newer (the source Mac uses 24.22.1). Run commands in song-system:
- npm ci
- npm test
- npx tsc --noEmit --incremental false
- npm run build

The devcontainer installs locked dependencies. Keep forwarded port 3000 PRIVATE. Do not publish it or expose an unauthenticated external port.

Starting the interactive app additionally requires a separate development configuration based on .env.example:
- LOCAL_ONLY=1
- A new development-only ADMIN_PASSWORD
- A new development-only SESSION_SECRET, at least 32 characters
- Optional DATA_DIR pointing to persistent private storage

Configure credentials through the approved secure environment flow. Never copy production/local secrets or commit .env.local. Do not use sample credentials on any publicly reachable service.

The original start command binds to 127.0.0.1. GitHub Codespaces private port forwarding provides authenticated access without changing that binding. Run npm run dev only after development credentials are securely configured.

## External communications
Do not run npm run telegram. The worker uses the real Telegram API and can send messages. No Telegram token is present in this export. Activating or moving the real bot requires separate approval and coordination to avoid duplicate polling workers.

## Data and backups
Start with an empty test database and invented customer details. SQLite uses WAL. For an approved later migration use SQLite Online Backup API to create a consistent database backup while the source runs, validate the backup with integrity_check and record hashes/counts, then separately copy only authorized referenced media. Never copy only system.sqlite while WAL writes are active. Test restoration in an isolated target before any cutover.

## Production is a separate milestone
The app deliberately rejects Vercel storage and requires LOCAL_ONLY=1. Production needs an approved persistence design, strong authentication, infrastructure request limits, backups with a restore test, and deployment review. A Codespace is a development workspace, not an always-on customer-facing service. Confirm quota/billing before creating chargeable resources.
