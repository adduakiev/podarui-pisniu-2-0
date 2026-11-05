import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'pisnia-chat-'));process.env.SESSION_SECRET='test-session-secret-at-least-thirty-two-characters';
test('brief skips existing answers, survives reload and reveals only assigned payment link after confirmation',async()=>{const {createOrder,updateOrder,listOrders}=await import('../lib/db');const {conversation,chatToken}=await import('../lib/conversation');const id=createOrder({name:'Тест',contact:'@test_chat',recipient:'Мамі',occasion:'Ювілей',requestId:crypto.randomUUID()});let c=conversation(id);assert.match(c.messages.at(-1)!.text,/Як звати/);assert.equal(chatToken(id).length,64);for(const answer of ['Олена','Ми познайомилися у Львові, маємо доньку. Хочу подякувати за нашу сім’ю.','Від мене'])c=conversation(id,answer);assert.equal(c.canConfirm,true);assert.equal(c.paymentLink,'');c=conversation(id,undefined,true);assert.equal(c.confirmed,true);const order=listOrders()[0];assert.match(order.notes,/познайомилися у Львові/);assert.equal(order.briefAt,null);updateOrder({id,revision:order.revision,status:order.status,notes:order.notes,nextAction:order.nextAction,completeBrief:false,paymentLink:'https://example.com/test-payment'});c=conversation(id);assert.equal(c.paymentLink,'https://example.com/test-payment');assert.equal(c.confirmed,true);});

test('questions are answered without consuming a brief field and remain in CRM history',async()=>{const {createOrder,listOrders,db}=await import('../lib/db');const {conversation}=await import('../lib/conversation');const id=createOrder({name:'Тест питань',contact:'@test_questions',recipient:'Дружині',requestId:crypto.randomUUID()});conversation(id);for(const question of ['як я отримаю пісню','ало як я отримаю пісню','чому не 3000 грн','скільки коштує?']){const c=conversation(id,question);assert.equal(c.mode,'assistant');assert.match(c.messages.at(-1)!.text,/MP3|2000/);const state=JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as any).body);assert.equal(state.answers.occasion,'');}assert.match(listOrders().find(o=>o.id===id)!.notes,/ало як я отримаю пісню/);});

test('explicit corrections invalidate confirmation and optional sound is saved',async()=>{const {createOrder,db}=await import('../lib/db');const {conversation}=await import('../lib/conversation');const id=createOrder({name:'Тест змін',contact:'@test_changes',recipient:'Мамі',occasion:'Ювілей',eventDate:'2026-11-20',story:'Ми познайомилися у Львові, маємо доньку. Я вдячна за нашу сім’ю.',requestId:crypto.randomUUID()});conversation(id);conversation(id,'Олена');conversation(id,'Від доньки');let c=conversation(id,'романтичне');assert.equal(c.canConfirm,true);assert.match(c.messages.at(-1)!.text,/романтичне/);conversation(id,undefined,true);c=conversation(id,'Змінити голос: чоловічий, ніжний поп');assert.equal(c.confirmed,false);assert.equal(c.canConfirm,true);assert.match(c.messages.at(-1)!.text,/Голос і настрій: чоловічий/);c=conversation(id,'Змінити дату: 25 листопада');const state=JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as any).body);assert.equal(state.answers.eventDate,'25 листопада');});

test('handoff persists across reload, records incoming text silently, blocks confirmation and requires owner resume',async()=>{const {createOrder,listOrders}=await import('../lib/db');const {conversation,resumeConversation}=await import('../lib/conversation');const id=createOrder({name:'Тест передачі',contact:'@test_handoff',recipient:'Дружині',requestId:crypto.randomUUID()});conversation(id);let c=conversation(id,'Покличте продюсера');assert.equal(c.mode,'producer');const n=c.messages.length;c=conversation(id,'Додаткові деталі для нього');assert.equal(c.messages.length,n+1);assert.equal(c.messages.at(-1)!.role,'user');c=conversation(id,undefined,true);assert.equal(c.confirmed,false);assert.equal(c.canConfirm,false);assert.equal(c.paymentLink,'');assert.equal(conversation(id).mode,'producer');assert.equal(listOrders().find(o=>o.id===id)!.communicationMode,'producer');resumeConversation(id);assert.equal(conversation(id).mode,'assistant');c=conversation(id,'Просто так');assert.match(c.messages.at(-1)!.text,/Як звати/);});

test('complaints, unknown questions and payment claims escalate without confirming payment',async()=>{const {createOrder,listOrders}=await import('../lib/db');const {conversation}=await import('../lib/conversation');for(const text of ['Отримувачу не сподобалася пісня','Я оплатив замовлення','чи можете ви заспівати на сцені?']){const id=createOrder({name:'Тест ескалації',contact:'@test_escalate',recipient:'Мамі',requestId:crypto.randomUUID()});conversation(id);assert.equal(conversation(id,text).mode,'producer');assert.equal(listOrders().find(o=>o.id===id)!.paid,0);}});

test('business terms match the agreed tariff and conversations preserve production status',async()=>{const {createOrder,listOrders,updateOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');for(const plan of ['story','military','own']){const id=createOrder({name:'Тест умов',contact:'@test_terms',recipient:'Мамі',plan,requestId:crypto.randomUUID()});conversation(id);const c=conversation(id,'як оплатити?');assert.match(c.messages.at(-1)!.text,plan==='story'?/решту 1000/:/повна оплата 1000/);const order=listOrders().find(o=>o.id===id)!;updateOrder({id,revision:order.revision,status:'Музика',notes:order.notes,nextAction:'Тест',completeBrief:false,paymentLink:''});conversation(id,'як я отримаю пісню?');assert.equal(listOrders().find(o=>o.id===id)!.status,'Музика');}});


test('greeting uses a transparent named manager without repeating client details',async()=>{const {createOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');const id=createOrder({name:'ВигаданеІмя',contact:'@test_hello',recipient:'ОсобливийОтримувач',occasion:'Річниця',requestId:crypto.randomUUID()});const c=conversation(id);assert.match(c.messages[0].text,/Олена/);assert.match(c.messages[0].text,/цифрова помічниця/);assert.doesNotMatch(c.messages[0].text,/ВигаданеІмя|ОсобливийОтримувач|цифровий помічник/);assert.match(c.messages.at(-1)!.text,/Як звати/);});

test('greetings and hesitation do not fill occasion, but a greeting with an occasion does',async()=>{
 const {createOrder,db}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 const id=createOrder({name:'Тест вітання',contact:'@test_greeting',recipient:'Дружині',requestId:crypto.randomUUID()});
 const answers=()=>JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}).body).answers;
 for(const message of ['Привіт','Доброго вечора!','👋','Я ще не знаю, що розповісти','Привіт! Хочу пісню для дружини, але не знаю, з чого почати.']){
  const c=conversation(id,message);assert.equal(answers().occasion,'');assert.match(c.messages.at(-1)!.text,/особлива нагода/);
 }
 const identity=conversation(id,'Ви людина чи бот?');assert.equal(identity.mode,'assistant');assert.match(identity.messages.at(-1)!.text,/цифрова помічниця/);
 const c=conversation(id,'Привіт, на річницю весілля');assert.equal(answers().occasion,'на річницю весілля');assert.match(c.messages.at(-1)!.text,/Як звати/);
});


test('anniversary message saves date and voluntary voice without repeating questions',async()=>{
 const {createOrder,db}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 const id=createOrder({name:'Тест',contact:'@test_context',recipient:'Дружині',requestId:crypto.randomUUID()});
 const c=conversation(id,'Хочу пісню дружині на річницю, до 20 листопада, жіночим голосом');
 const a=JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}).body).answers;
 assert.equal(a.occasion,'на річницю');assert.equal(a.eventDate,'20 листопада');assert.equal(a.sound,'жіночим голосом');
 assert.match(c.messages.at(-1)!.text,/гарна нагода.*Перевіримо.*Як звати/s);
 assert.doesNotMatch(c.messages.at(-1)!.text,/На яку дату|Який голос|Встигнемо/);
});

test('memorial and military stories receive distinct and persistent responses',async()=>{
 const {createOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 for(const [input,expected] of [['Хочу пісню пам’яті тата, він помер',/шкода Вашої втрати/],['Чоловік захищає Україну, хочу підтримати його піснею',/на відстані/]] as const){
  const id=createOrder({name:'Тест',contact:'@test_tone',recipient:'Близькій людині',requestId:crypto.randomUUID()});
  let c=conversation(id,input);assert.match(c.messages.at(-1)!.text,expected);
  c=conversation(id,'Олександр');assert.doesNotMatch(c.messages.at(-1)!.text,/🤍|🙂|Який голос/);
  assert.match(c.messages.at(-1)!.text,/спогадом|слова/);
 }
});

test('a rich story with a stated occasion asks only for the missing name',async()=>{
 const {createOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 const id=createOrder({name:'Тест',contact:'@test_story',recipient:'Коханому',requestId:crypto.randomUUID()});
 let c=conversation(id,'Ми познайомилися в Польщі, потім закохалися, маємо сина. Хочу пісню на день народження.');
 assert.match(c.messages.at(-1)!.text,/Як звати/);conversation(id,'Олександр');c=conversation(id,'Від мене');
 assert.equal(c.canConfirm,true);assert.match(c.messages.at(-1)!.text,/познайомилися в Польщі/);assert.doesNotMatch(c.messages.at(-1)!.text,/undefined|Який голос/);
});

test('local reply feedback preserves the original, reaches CRM notes, and stays with its order',async()=>{
 const {createOrder,listOrders}=await import('../lib/db');
 const {conversation,saveTestFeedback}=await import('../lib/conversation');
 const input={name:'Тест оцінки',contact:'@test_feedback',recipient:'Мамі'};
 const id=createOrder({...input,requestId:crypto.randomUUID()});
 const original=conversation(id).messages[0].text;
 conversation(id,'Привіт');
 const before=listOrders().find(o=>o.id===id)!;
 const feedback={replacement:'Вітаю! Розкажіть трішки про Вашу маму.',reason:'Менше формальностей'};
 assert.throws(()=>saveTestFeedback(id,2,feedback),/NOT_ASSISTANT_REPLY/);
 saveTestFeedback(id,0,feedback);
 const first=conversation(id).messages[0];
 assert.equal(first.text,original);assert.deepEqual(first.feedback,feedback);
 const after=listOrders().find(o=>o.id===id)!;
 assert.match(after.notes,/Менше формальностей/);assert.match(after.notes,/Бажана відповідь:/);
 assert.equal(after.status,before.status);assert.equal(after.nextAction,before.nextAction);
 const next=createOrder({...input,requestId:crypto.randomUUID()});
 assert.equal(conversation(next).messages[0].feedback,undefined);
 assert.deepEqual(conversation(id).messages[0].feedback,feedback);
});


test('the reported Дітей sequence cannot unlock checkout until a real story is reviewed',async()=>{
 const {createOrder,listOrders,updateOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 const id=createOrder({name:'Гість',contact:'Чат сайту',recipient:'Не вказано',opening:'Хочу пісню дружині',requestId:crypto.randomUUID()});
 let c=conversation(id);
 assert.equal(c.messages[1].text,'Хочу пісню дружині');
 for(const message of ['просто так','Катерина','Дітей'])c=conversation(id,message);
 assert.equal(c.storyReadiness,'developing');assert.equal(c.canConfirm,false);
 assert.match(c.messages.at(-1)!.text,/момент із дітьми/);
 assert.doesNotMatch(c.messages.at(-1)!.text,/вартість|передоплат|грн|перевірмо/i);
 const order=listOrders().find(o=>o.id===id)!;
 updateOrder({id,revision:order.revision,status:order.status,notes:order.notes,nextAction:order.nextAction,completeBrief:false,paymentLink:'https://example.com/test-payment'});
 assert.equal(conversation(id,undefined,true).paymentLink,'');
 c=conversation(id,'Ми познайомилися у Львові, маємо доньку. Хочу подякувати Катерині за нашу сім’ю.');
 assert.match(c.messages.at(-1)!.text,/Від чийого імені/);
 c=conversation(id,'Від мене');assert.equal(c.storyReadiness,'ready_for_review');assert.equal(c.canConfirm,true);assert.equal(c.paymentLink,'');
 assert.doesNotMatch(c.messages.at(-1)!.text,/2000 грн|передоплат/);
 c=conversation(id,undefined,true);assert.equal(c.storyReadiness,'confirmed');assert.equal(c.paymentLink,'https://example.com/test-payment');
});

test('a supplied name is not asked again and the first price question is answered without contact',async()=>{
 const {createOrder}=await import('../lib/db');const {conversation}=await import('../lib/conversation');
 const base={name:'Гість',contact:'Чат сайту',recipient:'Не вказано'};
 let id=createOrder({...base,opening:'Хочу дружині Катерині, до 20 листопада, жіночим голосом',requestId:crypto.randomUUID()});
 let c=conversation(id);assert.doesNotMatch(c.messages.at(-1)!.text,/Як звати|Для кого|На яку дату|Який голос/);
 id=createOrder({...base,opening:'Скільки коштує?',requestId:crypto.randomUUID()});
 c=conversation(id);assert.match(c.messages.at(-1)!.text,/2000 грн/);assert.equal(c.canConfirm,false);
});

test('the site opening preserves the relationship after the customer supplies the occasion', async () => {
  const { createOrder, listOrders } = await import('../lib/db');
  const { conversation } = await import('../lib/conversation');
  const id = createOrder({
    name: 'Гість',
    contact: 'Чат сайту',
    recipient: 'Не вказано',
    opening: 'Хочу для Матусі пісню',
    requestId: crypto.randomUUID(),
  });

  conversation(id);
  conversation(id, 'На день народження');
  const resumed = conversation(id);

  assert.ok(resumed.messages.some(message => message.role === 'user' && message.text === 'Хочу для Матусі пісню'));
  assert.ok(resumed.messages.some(message => message.role === 'user' && message.text === 'На день народження'));
  assert.equal(resumed.canConfirm, false);
  assert.equal(resumed.paymentLink, '');
  assert.match(listOrders().find(order => order.id === id)!.recipient, /^(?:мама|мамі|мами|матуся|матусі)$/iu);
});

test('recipient correction keeps the original and corrected source messages', async () => {
  const { createOrder, db, listOrders } = await import('../lib/db');
  const { conversation } = await import('../lib/conversation');
  const id = createOrder({
    name: 'Гість',
    contact: 'Чат сайту',
    recipient: 'Не вказано',
    opening: 'Хочу для Матусі пісню',
    requestId: crypto.randomUUID(),
  });
  conversation(id);
  conversation(id, 'На день народження');
  const corrected = conversation(id, 'Не для мами, а для бабусі');
  const row = db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as { body: string };
  const { factHistory, messages } = JSON.parse(row.body);
  assert.deepEqual(factHistory.recipient.map((fact: { source_message_id: number }) =>
    messages[fact.source_message_id].text), ['Хочу для Матусі пісню', 'Не для мами, а для бабусі']);
  assert.equal(listOrders().find(order => order.id === id)!.recipient, 'бабусі');
  assert.equal(corrected.canConfirm, false);
});
