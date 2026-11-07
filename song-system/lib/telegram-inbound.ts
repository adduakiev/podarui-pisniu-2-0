import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { conversation } from './conversation';
import { createOrder, db } from './db';
import { redeemTelegramLink, telegramLink, telegramLinks } from './telegram-links';

const chat = z.object({ id: z.number().int(), type: z.string() });
const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: z.object({ chat, text: z.string().max(15000).optional() }).optional(),
  callback_query: z.object({
    id: z.string(), data: z.string().optional(),
    message: z.object({ chat }).optional(),
  }).optional(),
});
type Outbound = {
  method: string;
  payload: Record<string, unknown>;
  state: 'pending' | 'sending' | 'sent' | 'uncertain';
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
    const send = (text: string, keyboard?: unknown) => outbound.push({
      method: 'sendMessage',
      payload: { chat_id: target!.id, text, ...(keyboard ? { reply_markup: keyboard } : {}) },
      state: 'pending',
    });
    const target = update.message?.chat ?? update.callback_query?.message?.chat;
    const text = update.message?.text ?? '';
    if (!target || target.type !== 'private') {
      save(update.update_id, { outbound });
      return update.update_id;
    }
    if (update.callback_query) {
      outbound.push({ method: 'answerCallbackQuery', payload: { callback_query_id: update.callback_query.id }, state: 'pending' });
    }
    telegramLinks(now);
    const start = text.match(/^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]+))?$/);
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
      const before = fresh ? undefined : conversation(orderId);
      const result = fresh
        ? conversation(orderId, start ? undefined : text)
        : update.callback_query?.data === 'confirm'
          ? conversation(orderId, undefined, true)
          : !start && text && !invalidCommand
            ? conversation(orderId, text)
            : before!;
      const replies = before?.mode === 'producer' ? []
        : fresh ? result.messages.filter(message => message.role === 'assistant')
          : start ? before!.messages.filter(message => message.role === 'assistant').slice(-1)
            : result.messages.slice(before!.messages.length).filter(message => message.role === 'assistant');
      for (const reply of replies) send(reply.text);
      if (result.mode !== 'producer' && result.canConfirm) {
        send('Підтвердіть підсумок або напишіть, що змінити.', {
          inline_keyboard: [[{ text: 'Так, усе правильно 🤍', callback_data: 'confirm' }]],
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
      const next = delivery.outbound.find(item => item.state === 'pending');
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
