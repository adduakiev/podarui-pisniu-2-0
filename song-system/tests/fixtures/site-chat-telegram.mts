import assert from 'node:assert/strict';
import {telegramBindingStatus} from '../../lib/telegram-approval';
import {db,listOrders} from '../../lib/db';import {processTelegramUpdate} from '../../lib/telegram-inbound';
const id=process.env.QA_ORDER,code=process.env.QA_CODE,chat=Number(process.env.QA_CHAT);
if(process.env.LOCAL_ONLY!=='1'||!process.env.DATA_DIR||!id||!code||!chat)throw Error('Synthetic isolated fixture required');
const before=listOrders(),original=before.find(o=>o.id===id)!;assert.ok(original?.opening);const link=db().prepare('SELECT * FROM telegram_links WHERE code=?').get(code) as any;assert.equal(link.orderId,id);assert.ok(link.expiresAt);
const sent:string[]=[];const transport=async(_method:string,payload:any)=>{sent.push(String(payload.text||''))};
const update=(offset:number,target:number,text:string)=>({update_id:chat*10+offset,message:{chat:{id:target,type:'private'},text}});
if(process.env.QA_PHASE==='start'){
 await processTelegramUpdate(update(0,chat+10000,'/start '+code),transport);
 await processTelegramUpdate(update(1,chat,'/start '+code),transport);
 assert.equal((db().prepare('SELECT chatId FROM telegram_links WHERE orderId=?').get(id) as any).chatId,null);
 assert.ok(sent.every(text=>text.includes('Історію ще не передано')));assert.equal(listOrders().length,before.length);
 const requests=telegramBindingStatus(id).pending;assert.equal(requests.length,2);
 console.log(JSON.stringify({unbound:true,noContext:true,attackerLabel:requests[0].label,legitimateLabel:requests[1].label}));process.exit(0);
}
await processTelegramUpdate(update(1,chat,'/start '+code),transport);
assert.equal((db().prepare('SELECT orderId FROM telegram_links WHERE chatId=?').get(String(chat)) as any).orderId,id);
const text='Вигаданий спогад: разом садили яблуню';const inbound=update(2,chat,text);await processTelegramUpdate(inbound,transport);const sends=sent.length;await processTelegramUpdate(inbound,transport);assert.equal(sent.length,sends);
const body=JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as any).body);assert.equal(body.messages.filter((m:any)=>m.role==='user'&&m.text===text).length,1);assert.ok(body.messages.some((m:any)=>m.text===original.opening));
await processTelegramUpdate(update(3,chat+10000,'/start '+code),transport);assert.ok(sent.at(-1)?.includes('Посилання вже не діє'));assert.equal(db().prepare('SELECT orderId FROM telegram_links WHERE chatId=?').get(String(chat+10000)),undefined);
await processTelegramUpdate(update(4,chat,'/start '+code),transport,Date.parse(link.expiresAt));assert.ok(sent.at(-1)?.includes('Посилання вже не діє'));
const after=listOrders(),saved=after.find(o=>o.id===id)!;assert.equal(after.length,before.length);assert.equal(saved.opening,original.opening);assert.equal(saved.paid,0);assert.equal(saved.lyricsTask,undefined);
console.log(JSON.stringify({sameOrder:true,openingPreserved:true,retryNoDuplicate:true,otherChatRejected:true,expiryRejected:true,recipient:saved.recipient,occasion:saved.occasion,sourcePage:saved.source_page??null,leadCount:after.length}));
