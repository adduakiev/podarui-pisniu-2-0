import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeOrderId, conversation, contactPause } from './conversation';
import { createOrder, db } from './db';
import { redeemTelegramLink, telegramLink, telegramLinks } from './telegram-links';

const chat = z.object({ id: z.number().int(), type: z.string() });
const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z.object({ chat, text: z.string().max(15000).optional(), caption: z.string().max(15000).optional() }).optional(),
  callback_query: z.object({
    id: z.string(), data: z.string().optional(),
    message: z.object({ chat }).optional(),
  }).optional(),
});
type Outbound = {
  orderId?:string;
  pauseAcknowledgementIndex?:number;
  method: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'sending' | 'sent' | 'uncertain' | 'suppressed';
};
type Delivery = { outbound: Outbound[] };
type Transport = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

function table() {
  const database = db();
  database.exec('CREATE TABLE IF NOT EXISTS telegram_deliveries(updateId INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  return database;
}

function save(updateId: number, delivery: Delivery) {
  table().prepare('INSERT OR REPLACE INTO telegram_deliveries VALUES(?,?)')
    .run(updateId, JSON.stringify(delivery));
}

function prepare(input: unknown, now: number) {
  const update = updateSchema.parse(input);
  const database = table();
  return database.transaction(() => {
    const saved = database.prepare('SELECT body FROM telegram_deliveries WHERE updateId=?')
      .get(update.update_id) as { body: string } | undefined;
    if (saved) return update.update_id;
    const outbound: Outbound[] = [];
    let deliveryOrderId:string|undefined;
    const send = (text: string, keyboard?: unknown, pauseAcknowledgementIndex?:number) => outbound.push({
      orderId:deliveryOrderId,pauseAcknowledgementIndex,method: 'sendMessage',
      payload: { chat_id: target!.id, text, ...(keyboard ? { reply_markup: keyboard } : {}) },
      state: 'pending',
    });
    const target = update.message?.chat ?? update.callback_query?.message?.chat;
    // Plaintext only: actual nonempty message text wins; media fields are stripped.
    const hasText=!!update.message?.text?.trim();
    const text=hasText?update.message!.text!:update.message?.caption?.trim()||'';
    if (!target || target.type !== 'private') {
      save(update.update_id, { outbound });
      return update.update_id;
    }
    // Unsupported/blank messages are no input: do not load a conversation or replay prompts.
    // Existing delivery rows were handled above and retain their original retry semantics.
    if (!update.callback_query && !text.trim()) {
      save(update.update_id, { outbound });
      return update.update_id;
    }
    if (update.callback_query) {
      outbound.push({ method: 'answerCallbackQuery', payload: { callback_query_id: update.callback_query.id }, state: 'pending' });
    }
    telegramLinks(now);
    // Captions never carry command/link authority.
    const start = hasText?text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/):null;
    const invalidCommand = /^\//.test(text) && !start;
    const linked = start?.[1]
      ? redeemTelegramLink(start[1], String(target.id), now)
      : database.prepare('SELECT * FROM telegram_links WHERE chatId=?').get(String(target.id)) as { orderId: string } | undefined;
    let orderId = linked?.orderId;
    let fresh = false;
    if (start?.[1] && !linked) {
      send('Посилання вже не діє або використане в іншому чаті. Відкрийте заявку на сайті й натисніть «Продовжити в Telegram» ще раз.');
    } else if (!orderId && (text || start) && !invalidCommand) {
      const createdId: string = createOrder({
        name: 'Клієнт Telegram', contact: 'Telegram:' + target.id,
        recipient: 'Не вказано', channel: 'Telegram', requestId: randomUUID(),
      }, 'telegram');
      orderId = createdId;
      const link = telegramLink(createdId, now);
      redeemTelegramLink(link.code, String(target.id), now);
      fresh = true;
    }

    if (orderId) {
      // A linked predecessor is not authority to read a successor bound elsewhere.
      const activeId = activeOrderId(orderId);
      if (activeId !== orderId && !redeemTelegramLink(telegramLink(activeId, now).code, String(target.id), now)) {
        send('Ця заявка недоступна в цьому чаті. Відкрийте свою заявку на сайті.');
        save(update.update_id, { outbound });
        return update.update_id;
      }
      const before = fresh ? undefined : conversation(orderId);
      const result = fresh
        ? conversation(orderId, start ? undefined : text)
        : (update.callback_query?.data === 'confirm:'+before?.orderId || (update.callback_query?.data === 'confirm' && before?.orderId===orderId && !(JSON.parse((database.prepare('SELECT body FROM orders WHERE id=?').get(orderId) as {body:string}).body).previousOrderId)))
          ? conversation(orderId, undefined, true)
          : !start && text && !invalidCommand
            ? conversation(orderId, text)
            : before!;
      if(result.orderId!==orderId){
        const nextLink=telegramLink(result.orderId,now);
        if (!redeemTelegramLink(nextLink.code,String(target.id),now)) throw new Error('SUCCESSOR_BINDING_DENIED');
      }
      deliveryOrderId=result.orderId;
      const changedOrder=before?.orderId!==result.orderId;
      const replies = result.contactPaused ? (before?.contactPaused?[]:result.messages.filter((_message,index)=>index===result.pauseAcknowledgementIndex)) : before?.mode === 'producer' && !changedOrder ? []
        : (fresh || changedOrder) ? result.messages.filter(message => message.role === 'assistant')
          : start ? before!.messages.filter(message => message.role === 'assistant').slice(-1)
            : result.messages.slice(before!.messages.length).filter(message => message.role === 'assistant');
      for (const reply of replies) send(reply.text,undefined,result.contactPaused?result.pauseAcknowledgementIndex:undefined);
      if (result.mode !== 'producer' && result.canConfirm) {
        send('Підтвердіть підсумок або напишіть, що змінити.', {
          inline_keyboard: [[{ text: 'Так, усе правильно 🤍', callback_data: 'confirm:'+result.orderId }]],
        });
      }
      if (result.mode !== 'producer' && result.confirmed && result.paymentLink) {
        send('Посилання для оплати вашого замовлення:', {
          inline_keyboard: [[{ text: 'Перейти до оплати', url: result.paymentLink }]],
        });
      }
    }
    save(update.update_id, { outbound });
    return update.update_id;
  })();
}

export async function processTelegramUpdate(input: unknown, transport: Transport, now = Date.now()) {
  const updateId = prepare(input, now);
  while (true) {
    const delivery = db().transaction(() => {
      const row = table().prepare('SELECT body FROM telegram_deliveries WHERE updateId=?')
        .get(updateId) as { body: string };
      const delivery: Delivery = JSON.parse(row.body);
      // A crash after a send began has an unknown outcome. Keep it for review.
      const uncertain = delivery.outbound.find(item => item.state === 'sending');
      if (uncertain) {
        uncertain.state = 'uncertain';
        save(updateId, delivery);
      }
      if (delivery.outbound.some(item => item.state === 'uncertain')) return;
      let next = delivery.outbound.find(item => item.state === 'pending');
      while(next&&next.method==='sendMessage'){
        const bound=next.orderId?undefined:db().prepare('SELECT orderId FROM telegram_links WHERE chatId=?').get(String(next.payload.chat_id)) as {orderId:string}|undefined;
        const id=next.orderId||bound?.orderId;
        const pause=id?contactPause(id):undefined;
        if(!pause?.paused||next.pauseAcknowledgementIndex!==undefined&&next.pauseAcknowledgementIndex===pause.acknowledgementIndex)break;
        next.state='suppressed';save(updateId,delivery);next=delivery.outbound.find(item=>item.state==='pending');
      }
      if (!next) return;
      next.state = 'sending';
      save(updateId, delivery);
      return { next, delivery };
    })();
    if (!delivery) break;
    try {
      await transport(delivery.next.method, delivery.next.payload);
      delivery.next.state = 'sent';
    } catch {
      delivery.next.state = 'uncertain';
    }
    save(updateId, delivery.delivery);
  }
  const row = table().prepare('SELECT body FROM telegram_deliveries WHERE updateId=?').get(updateId) as { body: string };
  const delivery: Delivery = JSON.parse(row.body);
  return { updateId, needsReview: delivery.outbound.some(item => item.state === 'uncertain') };
}
