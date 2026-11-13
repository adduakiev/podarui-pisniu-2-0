import {randomUUID,randomInt,randomBytes} from 'node:crypto';
import {telegramLinks,redeemTelegramLink} from './telegram-links';
type Pending={id:string;orderId:string;code:string;chatId:string;label:string;expiresAt:string;state:string};
function table(now:number){const d=telegramLinks(now);d.exec(`CREATE TABLE IF NOT EXISTS telegram_pending(id TEXT PRIMARY KEY,orderId TEXT NOT NULL,code TEXT NOT NULL,chatId TEXT NOT NULL,label TEXT NOT NULL,expiresAt TEXT NOT NULL,state TEXT NOT NULL,UNIQUE(code,chatId));`);d.prepare("UPDATE telegram_pending SET state='expired' WHERE state='pending' AND expiresAt<=?").run(new Date(now).toISOString());return d;}
export function requestTelegramBinding(code:string,chatId:string,now=Date.now()){
 const d=table(now);return d.transaction(()=>{
  const link=d.prepare('SELECT * FROM telegram_links WHERE code=?').get(code) as {orderId:string;chatId:string|null;expiresAt:string}|undefined;
  if(!link||Date.parse(link.expiresAt)<=now)return {status:'unavailable' as const};
  if(link.chatId)return link.chatId===chatId?{status:'bound' as const,link:redeemTelegramLink(code,chatId,now)!}:{status:'unavailable' as const};
  if(d.prepare('SELECT 1 FROM telegram_links WHERE orderId=? AND chatId IS NOT NULL').get(link.orderId))return {status:'unavailable' as const};
  if(d.prepare('SELECT 1 FROM telegram_links WHERE chatId=?').get(chatId))return {status:'unavailable' as const};
  const existing=d.prepare('SELECT * FROM telegram_pending WHERE code=? AND chatId=?').get(code,chatId) as Pending|undefined;
  if(existing)return existing.state==='pending'?{status:'pending' as const,label:existing.label}:{status:'unavailable' as const};
  const count=d.prepare("SELECT count(*) n FROM telegram_pending WHERE orderId=? AND state='pending'").get(link.orderId) as {n:number};if(count.n>=10)return {status:'unavailable' as const};
  let label:string;do{label=String(randomInt(100000,1000000));}while(d.prepare("SELECT 1 FROM telegram_pending WHERE orderId=? AND label=? AND state='pending'").get(link.orderId,label));
  const expiresAt=new Date(Math.min(now+10*60000,Date.parse(link.expiresAt))).toISOString();
  d.prepare('INSERT INTO telegram_pending VALUES(?,?,?,?,?,?,?)').run(randomUUID(),link.orderId,code,chatId,label,expiresAt,'pending');return {status:'pending' as const,label};
 })();
}
export function pendingTelegramForChat(chatId:string,now=Date.now()){return !!table(now).prepare("SELECT 1 FROM telegram_pending WHERE chatId=? AND state='pending'").get(chatId);}
export function telegramBindingStatus(orderId:string,now=Date.now()){
 const d=table(now);const rows=d.prepare("SELECT id,label,expiresAt FROM telegram_pending WHERE orderId=? AND state='pending' ORDER BY rowid").all(orderId);
 const bound=!!d.prepare('SELECT 1 FROM telegram_links WHERE orderId=? AND chatId IS NOT NULL').get(orderId);
 const renewal=d.prepare("SELECT p.id FROM telegram_pending p JOIN telegram_links l ON l.code=p.code WHERE p.orderId=? AND p.state IN ('expired','rejected') AND l.chatId IS NULL ORDER BY p.rowid DESC LIMIT 1").get(orderId) as {id:string}|undefined;
 return {bound,renewalId:renewal?.id,pending:rows as {id:string;label:string;expiresAt:string}[]};
}
// Caller must authenticate the existing web chat token and same-origin before invoking.
export function decideTelegramBinding(orderId:string,pendingId:string,action:'approve'|'reject'|'cancel',now=Date.now()){
 const d=table(now);return d.transaction(()=>{
  const p=d.prepare('SELECT * FROM telegram_pending WHERE id=? AND orderId=?').get(pendingId,orderId) as Pending|undefined;if(!p)throw Error('PENDING_NOT_FOUND');
  const desired=action==='approve'?'approved':action==='reject'?'rejected':'cancelled';if(p.state===desired)return {state:desired};if(p.state!=='pending'&&!(action==='cancel'&&['rejected','expired'].includes(p.state)))throw Error('PENDING_CLOSED');
  const link=d.prepare('SELECT * FROM telegram_links WHERE code=? AND orderId=?').get(p.code,orderId) as {chatId:string|null;expiresAt:string}|undefined;
  if(!link||Date.parse(link.expiresAt)<=now||(action!=='cancel'&&Date.parse(p.expiresAt)<=now))throw Error('PENDING_EXPIRED');
  if(action==='approve'){
   const order=JSON.parse((d.prepare('SELECT body FROM orders WHERE id=?').get(orderId) as {body:string}).body);if(order.contactPaused)throw Error('CONTACT_PAUSED');
   if(link.chatId||d.prepare('SELECT 1 FROM telegram_links WHERE orderId=? AND chatId IS NOT NULL').get(orderId)||d.prepare('SELECT 1 FROM telegram_links WHERE chatId=?').get(p.chatId))throw Error('BINDING_CONFLICT');
   d.prepare('UPDATE telegram_links SET chatId=? WHERE code=? AND chatId IS NULL').run(p.chatId,p.code);
   d.prepare("UPDATE telegram_pending SET state='cancelled' WHERE orderId=? AND state='pending' AND id<>?").run(orderId,p.id);
  }else if(action==='cancel'){
   if(link.chatId)throw Error('BINDING_CONFLICT');
   d.prepare('UPDATE telegram_links SET code=?,expiresAt=? WHERE code=?').run(randomBytes(24).toString('base64url'),new Date(now+86400000).toISOString(),p.code);
   d.prepare("UPDATE telegram_pending SET state='cancelled' WHERE code=? AND state='pending'").run(p.code);
  }
  d.prepare('UPDATE telegram_pending SET state=? WHERE id=?').run(desired,p.id);return {state:desired};
 })();
}
