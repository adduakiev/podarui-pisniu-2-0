import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { conversation } from './conversation';
import { createOrder, db } from './db';

const identifier = z.string().min(1).max(200);
const messaging = z.object({
  sender: z.object({ id: identifier }),
  recipient: z.object({ id: identifier }),
  message: z.object({
    mid: identifier,
    text: z.string().trim().min(1).max(15000),
    is_echo: z.boolean().optional(),
    is_self: z.boolean().optional(),
  }),
});
const delivery = z.object({
  object: z.literal('instagram'),
  entry: z.array(z.object({ id: identifier, messaging: z.array(z.unknown()).optional() })),
});

type Reply = { accountId: string; senderId: string; inboundId: string; text: string };
type Dependencies = {
  appSecret: string;
  verifyToken: string;
  accountIds: ReadonlySet<string>;
  send: (reply: Reply) => Promise<void>;
};

function signed(raw: Buffer, signature: string | null, secret: string) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

function record(accountId: string, senderId: string, inboundId: string, message: string) {
  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS instagram_threads (
      accountId TEXT NOT NULL, senderId TEXT NOT NULL, orderId TEXT NOT NULL,
      PRIMARY KEY (accountId, senderId)
    );
    CREATE TABLE IF NOT EXISTS instagram_inbound (
      accountId TEXT NOT NULL, inboundId TEXT NOT NULL, senderId TEXT NOT NULL,
      reply TEXT, sentAt TEXT,
      PRIMARY KEY (accountId, inboundId)
    );
  `);
  return database.transaction(() => {
    const key = [accountId, inboundId];
    if (database.prepare('SELECT 1 FROM instagram_inbound WHERE accountId=? AND inboundId=?').get(...key)) return;
    const thread = database.prepare('SELECT orderId FROM instagram_threads WHERE accountId=? AND senderId=?')
      .get(accountId, senderId) as { orderId: string } | undefined;
    const orderId = thread?.orderId ?? createOrder({
      name: 'Клієнт Instagram',
      contact: ('Instagram:' + senderId).slice(0, 200),
      recipient: 'Не вказано',
      channel: 'Instagram',
      requestId: randomUUID(),
    }, 'instagram');
    if (!thread) {
      database.prepare('INSERT INTO instagram_threads VALUES (?, ?, ?)').run(accountId, senderId, orderId);
    }
    const before = thread ? conversation(orderId).messages.length : 0;
    const result = conversation(orderId, message);
    const text = result.messages.slice(before).filter(item => item.role === 'assistant')
      .map(item => item.text).join('\n\n');
    database.prepare('INSERT INTO instagram_inbound (accountId, inboundId, senderId, reply) VALUES (?, ?, ?, ?)')
      .run(accountId, inboundId, senderId, text || null);
    return text;
  })();
}

export function createInstagramWebhook(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method === 'GET') {
      const query = new URL(request.url).searchParams;
      const challenge = query.get('hub.challenge');
      if (deps.verifyToken && query.get('hub.mode') === 'subscribe'
        && query.get('hub.verify_token') === deps.verifyToken && challenge !== null) {
        return new Response(challenge);
      }
      return new Response(null, { status: 403 });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const raw = Buffer.from(await request.arrayBuffer());
    if (!signed(raw, request.headers.get('x-hub-signature-256'), deps.appSecret)) {
      return new Response(null, { status: 403 });
    }
    let input: unknown;
    try {
      input = JSON.parse(raw.toString('utf8'));
    } catch {
      return new Response(null, { status: 400 });
    }
    const payload = delivery.safeParse(input);
    if (!payload.success) return new Response(null, { status: 400 });

    for (const entry of payload.data.entry) {
      if (!deps.accountIds.has(entry.id)) continue;
      for (const event of entry.messaging ?? []) {
        const parsed = messaging.safeParse(event);
        if (!parsed.success) continue;
        const { sender, recipient, message } = parsed.data;
        if (recipient.id !== entry.id || sender.id === entry.id || message.is_echo || message.is_self) continue;
        const text = record(entry.id, sender.id, message.mid, message.text);
        if (!text) continue;
        try {
          await deps.send({ accountId: entry.id, senderId: sender.id, inboundId: message.mid, text });
        } catch {
          // Keep the prepared reply for review. A webhook retry must not send it twice.
          continue;
        }
        db().prepare('UPDATE instagram_inbound SET sentAt=? WHERE accountId=? AND inboundId=?')
          .run(new Date().toISOString(), entry.id, message.mid);
      }
    }
    return new Response(null, { status: 200 });
  };
}
