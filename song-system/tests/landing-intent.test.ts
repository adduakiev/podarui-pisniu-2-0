import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
process.env.LOCAL_ONLY='1';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'landing-intent-'));
process.env.SESSION_SECRET='fictional-landing-test-secret-over32';
import {createOrder,db,listOrders,updateOrder} from '../lib/db';
import {conversation} from '../lib/conversation';
import {orderSchema,sourcePages} from '../lib/model';
const mother=sourcePages[0],birthday=sourcePages[1];
function lead(source_page:typeof sourcePages[number],opening:string,extra={}){
 return createOrder({name:'Вигаданий клієнт',contact:'Чат сайту',recipient:source_page===mother?'мама':'Не вказано',occasion:source_page===birthday?'День народження':'',source_page,opening,requestId:randomUUID(),...extra},'site');
}
const order=(id:string)=>listOrders().find(o=>o.id===id)!;
const state=(id:string)=>JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}).body);

test('landing hints survive a greeting but explicit openings win with original provenance',()=>{
 for(const [page,opening,key,expected,original] of [
  [mother,'Хочу пісню для бабусі','recipient','бабусі','мама'],
  [birthday,'Хочу пісню мамі на річницю весілля','occasion','на річницю весілля','День народження'],
 ] as const){
  const id=lead(page,opening);const c=conversation(id);
  assert.equal(order(id)[key],expected);assert.equal(order(id).source_page,page);
  assert.equal(order(id).landing_defaults?.[key],original);
  assert.equal(state(id).facts[key].status,'explicit');
  assert.equal(state(id).facts[key].source_message_id,1);
  assert.deepEqual(state(id).factHistory[key][0],{value:original,source_page:page,source_message_id:null,confidence:0.35,status:'unconfirmed'});
  assert.equal(c.paymentLink,'');assert.equal(c.confirmed,false);
  conversation(id);assert.equal(state(id).messages.filter((m:{role:string;text:string})=>m.role==='user'&&m.text===opening).length,1);
 }
 for(const page of sourcePages){const id=lead(page,'Привіт');conversation(id);const key=page===mother?'recipient':'occasion';assert.equal(state(id).facts[key].status,'unconfirmed');assert.equal(order(id)[key],page===mother?'мама':'День народження');}
});

test('later explicit details replace provisional hints, while mere mentions do not replace customer facts',()=>{
 const id=lead(mother,'Привіт');conversation(id);conversation(id,'Хочу пісню для бабусі');assert.equal(order(id).recipient,'бабусі');
 conversation(id,'Мамі подобається музика');assert.equal(order(id).recipient,'бабусі');
 const b=lead(birthday,'Привіт');conversation(b);conversation(b,'На річницю весілля');assert.equal(order(b).occasion,'На річницю весілля');
});

test('natural recipient and occasion corrections win and retain first message and attribution',()=>{
 const id=lead(birthday,'Хочу пісню для мами');conversation(id);
 conversation(id,'Не для мами, а для бабусі');
 conversation(id,'Не на день народження, а на річницю весілля');
 assert.equal(order(id).recipient,'бабусі');assert.equal(order(id).occasion,'річницю весілля');
 assert.equal(order(id).opening,'Хочу пісню для мами');assert.equal(order(id).source_page,birthday);
 assert.equal(state(id).facts.occasion.status,'explicit');assert.equal(state(id).factHistory.occasion[0].status,'unconfirmed');
 const o=order(id);updateOrder({id,revision:o.revision,status:o.status,notes:o.notes,nextAction:o.nextAction,completeBrief:false,paymentLink:''});
 assert.equal(order(id).source_page,birthday);assert.equal(order(id).landing_defaults?.occasion,'День народження');
});

test('edited form fields are explicit and sender phrases never replace recipient',()=>{
 const id=lead(mother,'Від коханого');conversation(id);assert.equal(order(id).recipient,'мама');
 const edited=lead(mother,'Привіт',{recipient:'Бабусі'});conversation(edited);assert.equal(order(edited).recipient,'Бабусі');assert.deepEqual(order(edited).landing_defaults,{});
 const b=lead(birthday,'Привіт',{occasion:'Річниця'});conversation(b);assert.equal(order(b).occasion,'Річниця');assert.deepEqual(order(b).landing_defaults,{});
});

test('source_page is an optional exact allowlist and client cannot inject provenance',()=>{
 const base={name:'Вигадана людина',contact:'Чат сайту',recipient:'мама',requestId:randomUUID()};
 for(const source_page of ['https://evil.example/pisnia-dlia-mamy','//evil.example','/admin','/pisnia-dlia-mamy?utm=x','/pisnia-dlia-mamy/','<script>',null])assert.equal(orderSchema.safeParse({...base,source_page}).success,false);
 assert.equal(orderSchema.safeParse(base).success,true);
 for(const source_page of sourcePages)assert.equal(orderSchema.safeParse({...base,source_page}).success,true);
 const id=createOrder({...base,landing_defaults:{recipient:'підміна'}});assert.equal(order(id).landing_defaults,undefined);
});

test('evidence-backed interpreted opening may replace a provisional landing fact',()=>{
 const id=lead(mother,'Хочу пісню для бабусі');
 conversation(id,'Хочу пісню для бабусі',false,{revision:0,proposal:{updates:[{field:'recipient',value:'бабусі',evidence:'для бабусі',correction:false}],action:'clarify',reply:'Як її звати?'}});
 assert.equal(order(id).recipient,'бабусі');assert.equal(state(id).factHistory.recipient[0].value,'мама');
});
