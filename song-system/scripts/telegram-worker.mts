import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const { telegramCall } = await import('../lib/telegram.ts');
const { db } = await import('../lib/db.ts');
const { processTelegramUpdate } = await import('../lib/telegram-inbound.ts');
const database = db();
database.exec('CREATE TABLE IF NOT EXISTS telegram_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
const webhook = await telegramCall('getWebhookInfo');
if (webhook.url) {
  console.log('BLOCKED: existing webhook; no changes made');
  process.exit(1);
}
console.log('Telegram worker ready: @podaruy_pisnyu_bot');
let offset = Number((database.prepare("SELECT value FROM telegram_state WHERE key='offset'").get() as {value:string}|undefined)?.value || 0);
while (true) {
  try {
    const updates = await telegramCall('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
    for (const update of updates) {
      const result = await processTelegramUpdate(update, telegramCall);
      if (result.needsReview) console.log('Telegram delivery requires review for update ' + result.updateId);
      offset = result.updateId + 1;
      database.prepare("INSERT OR REPLACE INTO telegram_state VALUES('offset',?)").run(String(offset));
    }
  } catch {
    console.log('Telegram connection paused; retrying in 5 seconds');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}
