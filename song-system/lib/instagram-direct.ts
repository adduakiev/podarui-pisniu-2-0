import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { contactPause } from './conversation';
import { createOrder, db } from './db';
import {processInbound,deliveryCurrent} from './process-inbound';
import {ensureInboundJob,beginDelivery,endDelivery,suppressJob,preparedCurrent} from './inbound-jobs';
import type {Interpreter} from './olena-interpreter';

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
  interpreter?:Interpreter;
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

async function record(accountId: string, senderId: string, inboundId: string, message: string,interpreter?:Interpreter) {
  const database = db();
  database.exec(`
    CREATE TABLE IF NOT EXISTS instagram_threads (
      accountId TEXT NOT NULL, senderId TEXT NOT NULL, orderId TEXT NOT NULL,
      PRIMARY KEY (accountId, senderId)
    );
    CREATE TABLE IF NOT EXISTS instagram_inbound_payloads(accountId TEXT NOT NULL,inboundId TEXT NOT NULL,senderId TEXT NOT NULL,message TEXT NOT NULL,receivedAt TEXT NOT NULL,PRIMARY KEY(accountId,inboundId));
    CREATE TABLE IF NOT EXISTS instagram_inbound (
      accountId TEXT NOT NULL, inboundId TEXT NOT NULL, senderId TEXT NOT NULL,
      reply TEXT, sentAt TEXT,
      PRIMARY KEY (accountId, inboundId)
    );
  `);
  const prepared=database.transaction(() => {
    const key = [accountId, inboundId];
    if (database.prepare('SELECT 1 FROM instagram_inbound WHERE accountId=? AND inboundId=?').get(...key)) return;
    const thread = database.prepare('SELECT orderId FROM instagram_threads WHERE accountId=? AND senderId=?')
      .get(accountId, senderId) as { orderId: string } | undefined;
    const orderId = thread?.orderId ?? createOrder({
      name: 'Клієнт Instagram',
      contact: ('Instagram:' + senderId).slice(0, 200),
      recipient: 'Не вказано', opening:message,
      channel: 'Instagram',
      requestId: randomUUID(),
    }, 'instagram');
    if (!thread) {
      database.prepare('INSERT INTO instagram_threads VALUES (?, ?, ?)').run(accountId, senderId, orderId);
    }
    database.prepare('INSERT INTO instagram_inbound (accountId,inboundId,senderId) VALUES(?,?,?)').run(accountId,inboundId,senderId);
    database.prepare('INSERT INTO instagram_inbound_payloads VALUES(?,?,?,?,?)').run(accountId,inboundId,senderId,message,new Date().toISOString());
    ensureInboundJob({orderId,channel:'instagram',eventId:JSON.stringify([accountId,inboundId,'message']),message});
    return {orderId,fresh:!thread};
  })();
  if(!prepared)return;
  const {orderId,fresh}=prepared;
  const before=fresh?undefined:await processInbound({orderId,channel:'instagram',snapshot:true});
  const result=await processInbound({orderId,channel:'instagram',eventId:JSON.stringify([accountId,inboundId,'message']),message},interpreter);
  return database.transaction(()=>{
    if(!preparedCurrent('instagram',JSON.stringify([accountId,inboundId,'message']),result.deliveryClaim))return {text:'',claim:result.deliveryClaim,orderId:result.orderId,revision:result.deliveryRevision,pauseAcknowledgementIndex:undefined};
    if(result.orderId!==orderId)database.prepare('UPDATE instagram_threads SET orderId=? WHERE accountId=? AND senderId=?').run(result.orderId,accountId,senderId);
    const replies=result.suppressReply?[]:result.contactPaused?(before?.contactPaused?[]:result.messages.filter((_item,index)=>index===result.pauseAcknowledgementIndex)):result.messages.slice(before?.orderId===result.orderId?before.messages.length:0);
    const text=replies.filter(item=>item.role==='assistant').map(item=>item.text).join('\n\n');
    database.prepare('UPDATE instagram_inbound SET reply=? WHERE accountId=? AND inboundId=?').run(text||null,accountId,inboundId);
    return {text,claim:result.deliveryClaim,orderId:result.orderId,revision:result.deliveryRevision,pauseAcknowledgementIndex:result.contactPaused?result.pauseAcknowledgementIndex:undefined};
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
        const reply = await record(entry.id, sender.id, message.mid, message.text,deps.interpreter);
        const eventId=JSON.stringify([entry.id,message.mid,'message']);
        if (!reply)continue;
        if (!reply.text||!deliveryCurrent(reply.orderId,reply.revision)){suppressJob('instagram',eventId,reply.claim);continue;}
        const pause=contactPause(reply.orderId);
        if(pause.paused&&(reply.pauseAcknowledgementIndex===undefined||reply.pauseAcknowledgementIndex!==pause.acknowledgementIndex)){suppressJob('instagram',eventId,reply.claim);continue;}
        const text=reply.text;
        if(!beginDelivery('instagram',eventId,reply.claim))continue;
        try {
          await deps.send({ accountId: entry.id, senderId: sender.id, inboundId: message.mid, text });
        } catch {
          endDelivery('instagram',eventId,reply.claim,true);
          // Keep the prepared reply for review. A webhook retry must not send it twice.
          continue;
        }
        endDelivery('instagram',eventId,reply.claim,false);
        db().prepare('UPDATE instagram_inbound SET sentAt=? WHERE accountId=? AND inboundId=?')
          .run(new Date().toISOString(), entry.id, message.mid);
      }
    }
    return new Response(null, { status: 200 });
  };
}
