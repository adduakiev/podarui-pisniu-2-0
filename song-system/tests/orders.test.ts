import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'pisnia-tests-'));
import {createOrder,listOrders,updateOrder,saveMedia,listMedia} from '../lib/db';
test('idempotent intake, tariff, immutable 48-hour deadline, payment conflict protection',()=>{const req={name:'Тестова Людина',contact:'test@example.com',channel:'Email',recipient:'Тестовий Отримувач',occasion:'Тест',eventDate:'',plan:'military',story:'Вигадана історія',requestId:randomUUID()};const id=createOrder(req);assert.equal(createOrder(req),id);assert.equal(listOrders().length,1);let o=listOrders()[0];assert.equal(o.amount,100000);assert.equal(o.dueAt,null);const update={id,revision:o.revision,status:'Текст',notes:'Наголос погоджено',nextAction:'Підготувати текст',completeBrief:true,paymentLink:'',payment:{amount:50000,note:'Тестова передоплата'}};updateOrder(update);o=listOrders()[0];assert.equal(o.paid,50000);assert.equal(Date.parse(o.dueAt!)-Date.parse(o.briefAt!),48*3600000);const due=o.dueAt;assert.throws(()=>updateOrder(update),/CONFLICT/);updateOrder({...update,revision:o.revision,payment:undefined});o=listOrders()[0];assert.equal(o.paid,50000);assert.equal(o.dueAt,due);assert.throws(()=>createOrder({...req,requestId:randomUUID(),plan:'bogus'}));});
test('public list excludes drafts and missing consent',()=>{const base={id:randomUUID(),kind:'review' as const,title:'Вигаданий відгук',description:'Тест',filename:'test.png',mime:'image/png',position:0,createdAt:new Date().toISOString(),published:false,consent:false};saveMedia(base);assert.equal(listMedia(true).length,0);saveMedia({...base,published:true});assert.equal(listMedia(true).length,0);saveMedia({...base,published:true,consent:true});assert.equal(listMedia(true).length,1);});

test('intake advances to lyrics only with a complete brief and confirmed funds',async()=>{
 process.env.SESSION_SECRET='crm-test-only';
 const {conversation}=await import('../lib/conversation');
 const id=createOrder({
  name:'Тест CRM',contact:'test@example.com',recipient:'Мама',story:'Вигаданий бриф',requestId:randomUUID()
 });
 const draft={id,status:'Збір інформації',notes:'Бриф',nextAction:'Підтвердити деталі',paymentLink:''};
 const deposit={amount:50000,note:'Частина передоплати'};
 const first=updateOrder({...draft,revision:0,completeBrief:false,payment:deposit});
 assert.equal(first.status,'Збір інформації');
 assert.equal(first.paid,50000);

 const second=updateOrder({...draft,revision:first.revision,completeBrief:false,payment:deposit});
 assert.equal(second.status,'Збір інформації');
 assert.equal(second.paid,100000);
 assert.throws(()=>updateOrder({...draft,revision:first.revision,completeBrief:false,payment:deposit}),/CONFLICT/);

 const started=updateOrder({...draft,revision:second.revision,completeBrief:true});
 assert.equal(started.status,'Текст');
 assert.equal(started.nextAction,'Підготувати текст пісні');
 conversation(id,'Ще один спогад');
 const afterMessage=listOrders().find(order=>order.id===id)!;
 assert.equal(afterMessage.status,'Текст');
 assert.equal(afterMessage.nextAction,started.nextAction);
 const later=updateOrder({...draft,status:'Музика',revision:afterMessage.revision,completeBrief:false,payment:{amount:100000,note:'Доплата'}});
 assert.equal(later.status,'Музика');
 assert.equal(later.dueAt,started.dueAt);
 assert.equal(later.paid,200000);
});

test('CRM filters distinguish intake, shared details, payment and delivery',async()=>{
 const {matchesCrmSegment}=await import('../lib/model');
 const id=createOrder({name:'Тест сегментів',contact:'test@example.com',recipient:'Мама',requestId:randomUUID()});
 const draft={id,status:'Збір інформації',notes:'',nextAction:'',paymentLink:'https://example.com/pay',completeBrief:false};
 const lead=listOrders().find(order=>order.id===id)!;
 assert.equal(matchesCrmSegment(lead,'intake'),true);
 assert.equal(matchesCrmSegment(lead,'followup'),false);
 assert.equal(matchesCrmSegment({...lead,contact:'Чат сайту'},'followup'),false);
 const configured=updateOrder({...draft,revision:lead.revision});
 assert.equal(matchesCrmSegment(configured,'paymentShared'),false);
 const sent=updateOrder({...draft,revision:configured.revision,paymentDetailsShared:true,payment:{amount:100000,note:'Передоплата'}});
 assert.equal(matchesCrmSegment(sent,'paymentShared'),true);
 assert.equal(matchesCrmSegment(sent,'partial'),true);
 assert.equal(matchesCrmSegment(sent,'paid'),false);
 const delivered=updateOrder({...draft,revision:sent.revision,status:'Передано',payment:{amount:100000,note:'Решта'}});
 assert.equal(delivered.paymentDetailsSharedAt,sent.paymentDetailsSharedAt);
 assert.equal(matchesCrmSegment(delivered,'paid'),true);
 assert.equal(matchesCrmSegment(delivered,'fulfilled'),true);
});

test('follow-up drafts respect timing, newer replies, payments and contact choices',async()=>{
 const {followupDraft}=await import('../lib/model');
 const id=createOrder({name:'CRM followup',contact:'test@example.com',recipient:'Мама',requestId:randomUUID()});
 const lead=listOrders().find(order=>order.id===id)!;
 const createdAt='2026-01-01T08:00:00Z';
 const shared='2026-01-02T08:00:00Z';
 const now=Date.parse('2026-01-03T08:00:00Z');
 const order={...lead,createdAt,paymentLink:'https://example.com/test'};
 assert.match(followupDraft(order,now)!,/ще актуальна/);
 assert.match(followupDraft({...order,followupDoubtAt:shared},now)!,/вагаєтеся/);
 assert.match(followupDraft({...order,paymentDetailsSharedAt:shared},now)!,/реквізитами/);
 assert.equal(followupDraft({...order,paymentDetailsSharedAt:shared},now-1),undefined);
 for(const fields of [
  {lastInboundAt:'2026-01-02T08:01:00Z'},
  {paid:100000},
  {followupOptOut:true},
  {followupSentAt:'2026-01-02T08:01:00Z'},
  {contact:'Чат сайту'},
 ]){
  assert.equal(followupDraft({...order,paymentDetailsSharedAt:shared,...fields},now),undefined);
 }
});

test('an incoming opt-out is persisted and removes a lead from follow-up',async()=>{
 process.env.SESSION_SECRET='crm-test-only';
 const {conversation}=await import('../lib/conversation');
 const {followupDraft}=await import('../lib/model');
 const id=createOrder({name:'Тест відмови',contact:'test@example.com',recipient:'Мама',requestId:randomUUID()});
 conversation(id,'Не пишіть мені, будь ласка');
 const order=listOrders().find(order=>order.id===id)!;
 assert.equal(order.followupOptOut,true);
 assert.ok(order.lastInboundAt);
 assert.equal(followupDraft(order,Date.now()+48*60*60*1000),undefined);
});
