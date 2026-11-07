import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { conversation } from '../lib/conversation';
import { db, createOrder, listOrders } from '../lib/db';
import { processTelegramUpdate } from '../lib/telegram-inbound';
import { telegramLink, telegramLinks } from '../lib/telegram-links';

process.env.LOCAL_ONLY = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pisnia-tg-reliability-'));
process.env.SESSION_SECRET = 'fixture-session-secret-at-least-thirty-two-characters';
const sends: { method: string; payload: Record<string, unknown> }[] = [];
const transport = async (method: string, payload: Record<string, unknown>) => { sends.push({method,payload}); };
const incoming = (id: number, text: string, chatId = 123456) => ({
  update_id: id, message: { chat: { id: chatId, type: 'private' }, text },
});

test('site context binds one lead, dedupes updates and persists producer silence', async () => {
  const id = createOrder({
    name:'Тест',contact:'@fixture',recipient:'Мамі',opening:'Хочу пісню для мами',
    requestId:crypto.randomUUID(),
  }, 'site');
  conversation(id);
  const link = telegramLink(id);
  const first = incoming(1, '/start ' + link.code);
  await processTelegramUpdate(first, transport);
  const sentAfterStart = sends.length;
  await processTelegramUpdate(first, transport);
  assert.equal(sends.length, sentAfterStart);
  await processTelegramUpdate(incoming(2, 'На день народження'), transport);
  await processTelegramUpdate(incoming(2, 'На день народження'), transport);
  assert.equal(listOrders().length, 1);
  assert.equal(listOrders()[0].id, id);
  assert.equal(listOrders()[0].source, 'site');
  const state = JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as any).body);
  assert.equal(state.messages.filter((m:any)=>m.text==='На день народження').length, 1);
  assert.equal(state.messages.filter((m:any)=>m.text==='Хочу пісню для мами').length, 1);
  await processTelegramUpdate(incoming(3, 'Покличте продюсера'), transport);
  assert.match(String(sends.at(-1)!.payload.text), /Передам/);
  const before = sends.length;
  await processTelegramUpdate(incoming(4, 'Додаткові деталі для продюсера'), transport);
  assert.equal(sends.length, before);
  assert.match(listOrders()[0].notes, /Додаткові деталі для продюсера/);
  assert.equal(listOrders()[0].communicationMode, 'producer');
});

test('expires unused links, refreshes site links and retains active chat bindings', async () => {
  const now = Date.now();
  const id = createOrder({name:'Тест',contact:'@expiry',recipient:'Мамі',requestId:crypto.randomUUID()});
  const link = telegramLink(id, now);
  const later = now + 24 * 60 * 60 * 1000 + 1;
  const count = listOrders().length;
  await processTelegramUpdate(incoming(10, '/start ' + link.code, 333), transport, later);
  assert.match(String(sends.at(-1)!.payload.text), /Посилання вже не діє/);
  assert.equal(listOrders().length, count);
  const renewed = telegramLink(id, later);
  assert.notEqual(renewed.code, link.code);
  await processTelegramUpdate(incoming(11, '/start ' + renewed.code, 333), transport, later);
  await processTelegramUpdate(incoming(12, '/start ' + renewed.code, 444), transport, later);
  assert.match(String(sends.at(-1)!.payload.text), /Посилання вже не діє/);
  const renewedAgain = telegramLink(id, later + 24 * 60 * 60 * 1000 + 1);
  assert.equal(renewedAgain.chatId, '333');
  await processTelegramUpdate(incoming(13, 'День народження', 333), transport, later + 24 * 60 * 60 * 1000 + 1);
  assert.match(listOrders().find(order=>order.id===id)!.notes, /День народження/);
});

test('migrates legacy expiry once, preserving bound chats and order ids', () => {
  const now = Date.now();
  db().exec('DROP TABLE telegram_links');
  db().exec('CREATE TABLE telegram_links(code TEXT PRIMARY KEY,orderId TEXT NOT NULL,chatId TEXT UNIQUE)');
  db().prepare('INSERT INTO telegram_links VALUES(?,?,?)').run('legacy', 'old-order', '111');
  telegramLinks(now);
  const old = db().prepare('SELECT * FROM telegram_links WHERE code=?').get('legacy') as any;
  assert.equal(old.orderId, 'old-order');
  assert.equal(old.chatId, '111');
  assert.equal(old.expiresAt, new Date(now+24*60*60*1000).toISOString());
  telegramLinks(now+1000);
  const again = db().prepare('SELECT expiresAt FROM telegram_links WHERE code=?').get('legacy') as any;
  assert.equal(again.expiresAt, old.expiresAt);
  db().prepare('DELETE FROM telegram_links WHERE code=?').run('legacy');
});

test('Telegram-first text and bare start each create one CRM lead', async () => {
  const count = listOrders().length;
  const text = incoming(20, 'Хочу пісню для мами', 222);
  await processTelegramUpdate(text, transport);
  await processTelegramUpdate(text, transport);
  await processTelegramUpdate(incoming(21, 'На день народження', 222), transport);
  assert.equal(listOrders().length, count+1);
  const order = listOrders().find(order=>order.contact==='Telegram:222')!;
  assert.equal(order.source, 'telegram');
  assert.match(order.notes, /Хочу пісню для мами/);
  assert.match(order.notes, /На день народження/);
  await processTelegramUpdate(incoming(22, '/start', 555), transport);
  await processTelegramUpdate(incoming(23, 'Хочу пісню для тата', 555), transport);
  assert.equal(listOrders().length, count+2);
});

test('send failure stores reply and inbound once, retry requires manual review', async () => {
  let calls = 0;
  const text = incoming(30, 'Хочу пісню для мами', 777);
  const fail = async () => { calls++; throw Error('simulated timeout after request'); };
  const first = await processTelegramUpdate(text, fail);
  const second = await processTelegramUpdate(text, fail);
  assert.equal(first.needsReview, true);
  assert.equal(second.needsReview, true);
  assert.equal(calls, 1);
  const order = listOrders().find(order=>order.contact==='Telegram:777')!;
  const state = JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(order.id) as any).body);
  assert.equal(state.messages.filter((m:any)=>m.text===text.message.text).length,1);
  const saved = JSON.parse((db().prepare('SELECT body FROM telegram_deliveries WHERE updateId=30').get() as any).body);
  assert.equal(saved.outbound[0].state,'uncertain');
});

test('successful replies stay sent when a later message fails and the update is replayed', async () => {
  let calls=0;
  const text=incoming(40,'Хочу пісню для мами',888);
  const failSecond=async ()=>{calls++;if(calls===2)throw Error('transport failure');};
  assert.equal((await processTelegramUpdate(text,failSecond)).needsReview,true);
  assert.equal((await processTelegramUpdate(text,failSecond)).needsReview,true);
  assert.equal(calls,2);
  const saved=JSON.parse((db().prepare('SELECT body FROM telegram_deliveries WHERE updateId=40').get() as any).body);
  assert.equal(saved.outbound[0].state,'sent');
  assert.equal(saved.outbound[1].state,'uncertain');
});

test('a crash after claiming a send becomes uncertain without sending again', async () => {
  const text=incoming(50,'Хочу пісню для мами',999);
  await processTelegramUpdate(text,transport);
  const saved=JSON.parse((db().prepare('SELECT body FROM telegram_deliveries WHERE updateId=50').get() as any).body);
  saved.outbound[0].state='sending';
  db().prepare('UPDATE telegram_deliveries SET body=? WHERE updateId=50').run(JSON.stringify(saved));
  const fail=async ()=>assert.fail('must not blindly resend');
  assert.equal((await processTelegramUpdate(text,fail)).needsReview,true);
});
