import { randomBytes } from 'node:crypto';
import { db } from './db';

const lifetime = 24 * 60 * 60 * 1000;
type Link = { code: string; orderId: string; chatId: string | null; expiresAt: string };

export function telegramLinks(now = Date.now()) {
  const database = db();
  database.exec('CREATE TABLE IF NOT EXISTS telegram_links(code TEXT PRIMARY KEY,orderId TEXT NOT NULL,chatId TEXT UNIQUE)');
  const columns = database.prepare('PRAGMA table_info(telegram_links)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'expiresAt')) {
    database.exec('ALTER TABLE telegram_links ADD COLUMN expiresAt TEXT');
  }
  database.prepare('UPDATE telegram_links SET expiresAt=? WHERE expiresAt IS NULL')
    .run(new Date(now + lifetime).toISOString());
  return database;
}

export function telegramLink(orderId: string, now = Date.now()): Link {
  const database = telegramLinks(now);
  return database.transaction(() => {
    const existing = database.prepare('SELECT * FROM telegram_links WHERE orderId=? LIMIT 1')
      .get(orderId) as Link | undefined;
    if (existing && new Date(existing.expiresAt).getTime() > now) return existing;
    const code = randomBytes(24).toString('base64url');
    const expiresAt = new Date(now + lifetime).toISOString();
    if (existing) {
      database.prepare('UPDATE telegram_links SET code=?,expiresAt=? WHERE code=?')
        .run(code, expiresAt, existing.code);
    } else {
      database.prepare('INSERT INTO telegram_links(code,orderId,expiresAt) VALUES(?,?,?)')
        .run(code, orderId, expiresAt);
    }
    return { code, orderId, chatId: existing?.chatId ?? null, expiresAt };
  })();
}

export function redeemTelegramLink(code: string, chatId: string, now = Date.now()) {
  const database = telegramLinks(now);
  return database.transaction(() => {
  const link = database.prepare('SELECT * FROM telegram_links WHERE code=?').get(code) as Link | undefined;
  if (!link || new Date(link.expiresAt).getTime() <= now || (link.chatId && link.chatId !== chatId)) return;
  if(link.chatId===chatId)return link;
  const order=JSON.parse((database.prepare('SELECT body FROM orders WHERE id=?').get(link.orderId) as {body:string}).body);
  const prior=database.prepare('SELECT orderId FROM telegram_links WHERE chatId=?').get(chatId) as {orderId:string}|undefined;
  // Native Telegram intake and an already-authorized successor are internal bindings.
  // A site/unbound bearer is never authority to bind itself.
  if(prior?order.previousOrderId!==prior.orderId:order.source!=='telegram')return;
  database.prepare('UPDATE telegram_links SET chatId=NULL,expiresAt=? WHERE chatId=? AND code<>?').run(new Date(now).toISOString(), chatId, code);
  database.prepare('UPDATE telegram_links SET chatId=? WHERE code=?').run(chatId, code);
  return { ...link, chatId };
  })();
}
