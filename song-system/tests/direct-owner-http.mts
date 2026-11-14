import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createInstagramWebhook} from '../lib/instagram-direct';
import {db,listOrders} from '../lib/db';
import {dialogueContext,dialogueSnapshot} from '../lib/conversation';
import type {Interpretation} from '../lib/olena-interpreter';
const base=process.env.QA_BASE||'http://127.0.0.1:3147';
assert.ok(process.env.DATA_DIR&&process.env.LOCAL_ONLY==='1');assert.equal(new URL(base).hostname,'127.0.0.1');
const account='synthetic-direct',sender='synthetic-person',secret='synthetic-webhook-key',sent:string[]=[];
const handler=createInstagramWebhook({appSecret:secret,verifyToken:'synthetic-verify',accountIds:new Set([account]),send:async r=>{assert.equal(db().isTransaction,false);sent.push(r.text)},interpreter:async c=>{
 assert.equal(db().isTransaction,false);assert.equal(listOrders().length,1);
 const values:Record<string,[Interpretation['updates'][number]['field'],string]>={'Просто так.':['occasion','Просто так'],'Ярина':['sender','Ярина'],'Від мене.':['narrator','Від мене'],'Перша прогулянка':['story','Перша прогулянка'],'Хочу сказати, що люблю її.':['story','Хочу сказати, що люблю її.']};
 const value=c.message.startsWith('Хочу пісню для мами')?['recipient','мама'] as const:values[c.message];return {action:'summarize',reply:'Уточнімо задум.',updates:value?[{field:value[0],value:value[1],evidence:c.message,correction:false}]:[]};
}});
async function inbound(text:string,mid=randomUUID()){const body=JSON.stringify({object:'instagram',entry:[{id:account,messaging:[{sender:{id:sender},recipient:{id:account},message:{mid,text}}]}]});assert.equal((await handler(new Request(base+'/api/instagram',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(body).digest('hex')}}))).status,200)}
let cookie='';async function api(path:string,method='GET',body?:unknown,auth=true,origin=base){return fetch(base+path,{method,headers:{origin,'content-type':'application/json',...(auth&&cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)})}
assert.equal((await api('/api/orders')).status,401);
const login=await api('/api/session','POST',{password:'synthetic-only-direct-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];assert.ok(cookie.startsWith('admin_session='));
const opening='Хочу пісню для мами';await inbound(opening);const id=listOrders()[0].id;await inbound('email: first@example.test; телефон: +380501112233');
await inbound('email: second@example.test');await inbound('Telegram немає, залишімося тут');
for(const text of ['Просто так.','Ярина','Перша прогулянка','Хочу сказати, що люблю її.','Від мене.'])await inbound(text);
assert.equal(dialogueSnapshot(id).canConfirm,true);const current=()=>listOrders().find(o=>o.id===id)!;
assert.equal(current().opening,opening);assert.equal(current().channel,'Instagram');assert.ok(['first@example.test','second@example.test','+380501112233'].every(v=>current().contacts!.some(c=>c.value===v&&c.provenance.some(p=>p.channel==='instagram'))));
const command=(extra:Record<string,unknown>={})=>({id,revision:current().revision,status:current().status,notes:current().notes,nextAction:current().nextAction,completeBrief:false,paymentLink:'https://payments.example.test/direct-fixture',commandId:randomUUID(),...extra});
const config=command();assert.equal((await api('/api/orders','PATCH',config,false)).status,403);assert.equal((await api('/api/orders','PATCH',config,true,'https://foreign.example.test')).status,403);assert.equal((await api('/api/orders','PATCH',config)).status,200);
const confirmId=randomUUID();await inbound('Підтверджую бриф',confirmId);assert.equal(dialogueSnapshot(id).confirmed,true);assert.ok(sent.at(-1)!.includes(config.paymentLink));const count=sent.length;await inbound('Підтверджую бриф',confirmId);assert.equal(sent.length,count);assert.equal(current().paid,0);
await inbound('Оплатив');assert.equal(current().paid,0);
const payment=command({completeBrief:true,confirmTerms:true,payment:{amount:100000,note:'Synthetic HTTP receipt, no real money'}});assert.equal((await api('/api/orders','PATCH',payment)).status,200);assert.equal((await api('/api/orders','PATCH',payment)).status,200);
assert.equal(current().paid,100000);assert.equal(current().status,'Текст');assert.equal(db().prepare('SELECT count(*) n FROM payments WHERE orderId=?').get(id)?.n,1);assert.equal(db().prepare('SELECT count(*) n FROM lyrics_tasks WHERE orderId=?').get(id)?.n,1);
const orders=await (await api('/api/orders')).json();assert.equal(orders.length,1);assert.equal(orders[0].lyricsTask.orderId,id);
assert.ok(dialogueContext(id).messages.some(m=>m.text==='Telegram немає, залишімося тут'));await inbound('Покличте менеджера');assert.equal(current().communicationMode,'producer');const paused=sent.length;await inbound('Додам ще деталь');assert.equal(sent.length,paused);await inbound('Не пишіть мені');assert.equal(current().contactPaused,true);const stopped=sent.length;await inbound('Підтверджую бриф');assert.equal(sent.length,stopped);assert.equal(current().channel,'Instagram');assert.equal(listOrders().length,1);
console.log(JSON.stringify({result:'PASS',signedWebhook:'synthetic handler',interpreter:'injected',transport:'fake',ownerLogin:200,unauthenticatedRead:401,unauthorizedWrite:403,crossOrigin:403,orders:1,contacts:3,briefConfirmed:true,configuredDirectCTA:true,paidMinor:100000,paymentRows:1,lyricsTasks:1,tgRefusal:'saved message evidence',handoff:'PASS',stop:'PASS',channel:'Instagram',liveAPI:false}));
