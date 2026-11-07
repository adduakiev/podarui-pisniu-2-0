# Telegram release reliability

Base commit `273cd2479ba1cee755a7dcd7c499cd923ff5228d`.

The polling worker uses the same conversation engine and CRM order as the site. A Telegram-only private text or bare /start creates one lead with source telegram. Site continuation uses the existing order and keeps its opening, transcript and producer state.

Site links expire after 24 hours. Opening a site conversation after expiry rotates its token while keeping any linked chat. Established chats continue after the token expires. A token already bound to a different chat is rejected. Existing database rows without an expiry get a single 24-hour grace period on migration, with their current order and chat bindings preserved.

Each update ID is recorded atomically with its conversation changes and prepared outbound messages. Replays reuse the saved outcome. Successful sends are persisted individually. A send that fails or was in progress when the process crashed is marked uncertain. The worker records the update offset and reports its ID for operator review. Subsequent polling of that update sends nothing automatically. The remote API can accept a message before a connection fails, so review the chat before manually retrying any uncertain delivery. The saved reply remains in telegram_deliveries.body.

Run one polling worker and one local persistent SQLite store. An existing Telegram webhook stops polling. First startup reads pending updates from offset 0 instead of dropping the pending queue. Text and the existing confirmation callback are covered. Media, automatic recovery of uncertain outbound messages, expiry notification and a delivery-review admin screen remain follow-up work.

Verification covers the site opening, one CRM lead, duplicate updates, producer handoff, token expiry and migration, Telegram-only intake, send failure, a successful send followed by a failed send, and a crash after a send was claimed. All external calls in these checks use fake transport. The dialogue engine still has the previously observed name-extraction defect for “Матуся Галина”; transport reliability does not resolve it.
