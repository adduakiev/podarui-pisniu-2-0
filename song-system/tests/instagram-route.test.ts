import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GET, POST } from '../app/api/instagram/webhook/route';
import { db, listOrders } from '../lib/db';
import { handleInstagramRequest } from '../lib/instagram-route';

process.env.LOCAL_ONLY = '1';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pisnia-instagram-route-'));
process.env.SESSION_SECRET = 'fixture-session-secret-at-least-thirty-two-characters';
process.env.INSTAGRAM_DIRECT_ENABLED = '0';

const env = {
  LOCAL_ONLY: '1',
  DATA_DIR: process.env.DATA_DIR,
  SESSION_SECRET: process.env.SESSION_SECRET,
  INSTAGRAM_DIRECT_ENABLED: '1',
  INSTAGRAM_DIRECT_ACCOUNT_ID: '12345',
  INSTAGRAM_DIRECT_API_VERSION: 'v99.0',
  INSTAGRAM_DIRECT_ACCESS_TOKEN: 'fixture-token',
  INSTAGRAM_DIRECT_APP_SECRET: 'fixture-app-secret',
  INSTAGRAM_DIRECT_VERIFY_TOKEN: 'fixture-verify-token',
};
const url = 'https://staging.example.test/api/instagram/webhook';

function request(mid: string, secret = env.INSTAGRAM_DIRECT_APP_SECRET) {
  const body = JSON.stringify({
    object: 'instagram',
    entry: [{ id: '12345', messaging: [{
      sender: { id: '54321' }, recipient: { id: '12345' },
      message: { mid, text: 'Хочу пісню для мами' },
    }] }],
  });
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  return new Request(url, { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + signature } });
}

test('Next GET and POST remain unavailable while disabled', async () => {
  assert.equal((await GET(new Request(url))).status, 404);
  assert.equal((await POST(request('disabled'))).status, 404);
  assert.equal(listOrders().length, 0);
});

test('requires complete staging configuration and authenticates inbound HTTP', async () => {
  const neverFetch = async () => assert.fail('Unexpected send');
  const incomplete = { ...env, INSTAGRAM_DIRECT_ACCESS_TOKEN: '' };
  assert.equal((await handleInstagramRequest(request('missing'), incomplete, neverFetch)).status, 503);
  assert.equal((await handleInstagramRequest(request('forged', 'wrong'), env, neverFetch)).status, 403);
  const challenge = await handleInstagramRequest(new Request(
    url + '?hub.mode=subscribe&hub.verify_token=fixture-verify-token&hub.challenge=5678',
  ), env, neverFetch);
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), '5678');
  assert.equal(listOrders().length, 0);
});

test('sends to Meta using injectable transport and records only confirmed responses', async () => {
  const sent: Request[] = [];
  const fakeMeta: typeof fetch = async (target, options) => {
    sent.push(new Request(target, options));
    return Response.json(sent.length === 1 ? { message_id: 'message-sent' } : {});
  };
  assert.equal((await handleInstagramRequest(request('ok'), env, fakeMeta)).status, 200);
  assert.equal((await handleInstagramRequest(request('ok'), env, fakeMeta)).status, 200);
  assert.equal((await handleInstagramRequest(request('unconfirmed'), env, fakeMeta)).status, 200);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].url, 'https://graph.instagram.com/v99.0/12345/messages');
  assert.equal(sent[0].headers.get('authorization'), 'Bearer fixture-token');
  assert.equal(sent[0].redirect, 'error');
  const payload = await sent[0].json();
  assert.equal(payload.recipient.id, '54321');
  assert.match(payload.message.text, /Олена/);
  assert.equal(listOrders().length, 1);
  const rows = db().prepare('SELECT inboundId, sentAt FROM instagram_inbound ORDER BY rowid').all();
  assert.ok(rows[0].sentAt);
  assert.equal(rows[1].sentAt, null);
});
