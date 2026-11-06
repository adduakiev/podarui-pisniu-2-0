import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createInstagramWebhook } from '../lib/instagram-direct';
import { db, listOrders } from '../lib/db';

process.env.LOCAL_ONLY = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pisnia-instagram-'));
process.env.SESSION_SECRET = 'fixture-session-secret-at-least-thirty-two-characters';

const secret = 'fixture-instagram-secret';
const url = 'http://localhost/api/instagram/webhook';
const sent: string[] = [];
const handler = createInstagramWebhook({
  appSecret: secret,
  verifyToken: 'challenge-token',
  accountIds: new Set(['ig1', 'ig2']),
  send: async ({ text }) => {
    if (text.includes('2000')) throw Error('fixture delivery failed');
    sent.push(text);
  },
});

function fixture(mid: string, text: string, options: { account?: string; badSignature?: boolean; echo?: boolean } = {}) {
  const account = options.account ?? 'ig1';
  const body = JSON.stringify({
    object: 'instagram',
    entry: [{ id: account, messaging: [{
      sender: { id: 'sender-1' }, recipient: { id: account },
      message: { mid, text, is_echo: options.echo },
    }] }],
  });
  const signature = createHmac('sha256', options.badSignature ? 'wrong' : secret).update(body).digest('hex');
  return handler(new Request(url, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + signature } }));
}

test('verifies webhook challenge and rejects invalid, echo and unrelated events', async () => {
  const challenge = await handler(new Request(url + '?hub.mode=subscribe&hub.verify_token=challenge-token&hub.challenge=1234'));
  assert.equal(await challenge.text(), '1234');
  assert.equal((await handler(new Request(url + '?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234'))).status, 403);
  assert.equal((await fixture('invalid', 'Привіт', { badSignature: true })).status, 403);
  assert.equal((await fixture('echo', 'Привіт', { echo: true })).status, 200);
  assert.equal((await fixture('other', 'Привіт', { account: 'other' })).status, 200);
  assert.equal(listOrders().length, 0);
  assert.equal(sent.length, 0);
});

test('deduplicates inbound and dispatch, maintains CRM context, then silences handoff', async () => {
  await Promise.all([fixture('m1', 'Хочу пісню для мами'), fixture('m1', 'Хочу пісню для мами')]);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Олена/);
  await fixture('m2', 'На день народження');
  assert.equal(sent.length, 2);
  assert.match(sent[1], /звати/);
  assert.equal(listOrders().length, 1);
  let [order] = listOrders();
  assert.equal(order.source, 'instagram');
  assert.match(order.recipient, /мам/i);
  assert.match(order.notes, /день народження/);
  await fixture('m3', 'Покличте продюсера');
  assert.match(sent[2], /Передам/);
  await fixture('m4', 'Додаткові деталі для нього');
  [order] = listOrders();
  assert.equal(order.communicationMode, 'producer');
  assert.match(order.notes, /Додаткові деталі для нього/);
  assert.equal(sent.length, 3);
  await fixture('m1', 'Хочу пісню для мами', { account: 'ig2' });
  assert.equal(listOrders().length, 2);
  assert.equal(sent.length, 4);
});

test('preserves a failed delivery for review without retrying blindly', async () => {
  await fixture('failed-send', 'Скільки коштує?', { account: 'ig2' });
  await fixture('failed-send', 'Скільки коштує?', { account: 'ig2' });
  const event = db().prepare('SELECT reply, sentAt FROM instagram_inbound WHERE inboundId=?')
    .get('failed-send') as { reply: string; sentAt: string | null };
  assert.match(event.reply, /2000/);
  assert.equal(event.sentAt, null);
  assert.equal(sent.length, 4);
});
