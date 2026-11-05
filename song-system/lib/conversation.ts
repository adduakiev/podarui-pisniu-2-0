import {createHmac,randomBytes} from 'node:crypto';
import {db} from './db';
import type {Order} from './model';
import {explicitDetails,reaction,toneOf,type Tone} from './olena-context';

export function chatToken(id:string){return createHmac('sha256',process.env.SESSION_SECRET!).update('chat:'+id).digest('hex')}
export const questions=[
 {key:'occasion',label:'Привід'},
 {key:'eventDate',label:'Дата подарунка'},
 {key:'sender',label:'Від кого та імена'},
 {key:'story',label:'Історія та головна думка'},
 {key:'sound',label:'Голос і настрій'},
 {key:'avoid',label:'Чого не згадувати'}
];
type State={tone?:Tone;answers:Record<string,string>;messages:{role:'assistant'|'user';text:string;feedback?:{replacement:string;reason:string}}[];confirmed:boolean;mode:'assistant'|'producer';handoffReason?:string};
function load(id:string){
 db().exec('CREATE TABLE IF NOT EXISTS conversations(orderId TEXT PRIMARY KEY,body TEXT NOT NULL)');
 const row=db().prepare('SELECT body FROM orders WHERE id=?').get(id) as {body:string}|undefined;
 if(!row)throw Error('NOT_FOUND');
 const order=JSON.parse(row.body) as Order;
 const saved=db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}|undefined;
 const state:State=saved?JSON.parse(saved.body):{answers:{occasion:order.occasion,eventDate:order.eventDate,story:order.story},messages:[{role:'assistant',text:'Вітаю! Я Олена, AI-менеджер «Подаруй пісню» 🤍 Допоможу створити пісню, яка збереже важливі для вас моменти.'}],confirmed:false,mode:'assistant'};
 state.tone??=toneOf([state.answers.occasion,state.answers.story,order.recipient].join(' '));
 state.mode=order.communicationMode||state.mode||'assistant';
 return {order,state};
}
function nextField(s:State){return questions.find(q=>['occasion','sender','story'].includes(q.key)&&!s.answers[q.key]);}
function next(s:State,order:Order){
 const q=nextField(s);
 if(q?.key==='occasion')return 'З якої нагоди хочете подарувати пісню?';
 if(q?.key==='sender')return s.tone==='memory'?'Як звати людину, якій присвячуємо пісню, якщо Вам комфортно про це говорити?':'Як звати людину, для якої створюємо пісню?';
 if(q?.key==='story'){
  if(order.plan==='own')return 'Надішліть, будь ласка, Ваш текст.';
  if(s.tone==='memory')return 'Якщо Вам комфортно, яким спогадом хотіли б поділитися в пісні?';
  if(s.tone==='distance')return 'Які слова Ви найбільше хотіли б передати цією піснею?';
  return 'Який спільний момент або почуття Вам хотілося б передати в пісні?';
 }
}
function payment(o:Order){return o.amount===200000?'Можна внести 1000 грн передоплати, а решту 1000 грн — після отримання готової пісні. Або оплатити всі 2000 грн одразу, як вам зручніше.':'Для цього формату — повна оплата 1000 грн перед початком роботи.'}
function summary(s:State,o:Order){return `Дякую, що поділилися історією. Перевірмо деталі:\nДля кого: ${o.recipient}.\n${questions.filter(q=>s.answers[q.key]).map(q=>`${q.label}: ${s.answers[q.key]}`).join('\n')}\nВартість — ${o.amount/100} грн${o.plan==='own'?' після перегляду тексту':''}. ${payment(o)}\nСтворення — до 48 годин після отримання повної інформації. Термінову дату окремо погоджуємо з продюсером. До 5 раундів правок; якщо після них результат не погоджено — повертаємо всю фактично сплачену суму.\nУсе правильно? Якщо треба змінити деталь, напишіть, наприклад: «Змінити дату: 20 листопада».`}

// Conservative, explicit routing. This is a scripted fallback, not a free-form AI model.
function answerQuestion(text:string,o:Order){
 const answers:string[]=[];
 if(/цін|вартіст|кошту|дорого|3000|знижк/iu.test(text))answers.push(`Обраний формат коштує ${o.amount/100} грн${o.plan==='own'?' після перегляду вашого тексту':''}. ${payment(o)} Ціну не змінюємо без погодження.`);
 else if(/оплат|передоплат|аванс|реквізит/iu.test(text))answers.push(payment(o)+' Реквізити або посилання на оплату надамо після погодження замовлення.');
 if(/отрима|надішл|скача|завантаж|файл|mp3/iu.test(text))answers.push('Готову пісню надішлемо файлом MP3 у погоджений месенджер. Зможете зберегти її на телефон чи комп’ютер та подарувати вашій людині 🤍');
 if(/строк|термін|коли.*готов|скільки.*час|довго/iu.test(text))answers.push('Термін створення — до 48 годин після отримання повної інформації для пісні. Якщо подарунок потрібен раніше, можливість підтвердить продюсер.');
 if(/правк|перероб|не сподоба/iu.test(text))answers.push('Можна зібрати побажання до оновленої версії — до 5 раундів правок. Якщо після них результат не погоджено, повертаємо всю фактично сплачену суму. Якщо пісня не сподобалася отримувачу, питання розглядає продюсер.');
 if(/голос|стил|настрій/iu.test(text))answers.push('Вокал і звучання підбираємо під Вашу історію. Якщо маєте побажання, напишіть їх — врахуємо.');
 return answers.join('\n\n');
}
function isQuestion(text:string){return /\?|^(?:(?:а|ало|підкажіть|скажіть)[,!]?\s+)?(?:як|чому|коли|скільки|чи|яка|який|можна)(?=\s|$|[,.!])/iu.test(text)||/кошту|вартіст|дорого|яка ціна/iu.test(text)}
function correction(text:string){return text.match(/^(?:змінити|змініть|заміни|виправити|виправте)\s+(дату|привід|голос|настрій|історію|імена|ім’я|отримувача|для кого)\s*[:—-]\s*(.+)$/isu)}
function save(id:string,state:State,order:Order,changed:boolean,feedbackOnly=false){
 db().prepare('INSERT OR REPLACE INTO conversations VALUES(?,?)').run(id,JSON.stringify(state));
 if(!changed)return;
 const prefix=order.notes.split('\n\n[Чат сайту]')[0];
 const brief=questions.filter(q=>state.answers[q.key]).map(q=>q.label+': '+state.answers[q.key]).join('\n');
 const notes=prefix+'\n\n[Чат сайту]\n'+(brief?'Творчий бриф:\n'+brief+'\n\n':'')+state.messages.map(m=>(m.role==='user'?'Клієнт: ':'Помічник: ')+m.text+(m.feedback?'\n[Оцінка тесту] '+(m.feedback.reason||'')+'\nБажана відповідь: '+m.feedback.replacement:'')).join('\n');
 db().prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify(feedbackOnly?{...order,notes,revision:order.revision+1}:{...order,communicationMode:state.mode,handoffReason:state.handoffReason||'',revision:order.revision+1,status:order.status==='Нове звернення'?'Збір інформації':order.status,nextAction:state.mode==='producer'?'Продюсеру: '+state.handoffReason:state.confirmed?'Перевірити погоджений бриф та оплату':'Переглянути діалог і доповнити бриф',notes}),id);
}
export function resumeConversation(id:string){return db().transaction(()=>{const {state,order}=load(id);state.mode='assistant';state.handoffReason=undefined;save(id,state,order,true);return {ok:true}})()}
export function conversation(id:string,message?:string,confirm=false){return db().transaction(()=>{
 const {order,state}=load(id);const originalCount=state.messages.length;const say=(text:string)=>state.messages.push({role:'assistant',text:state.tone==='memory'?text.replace(/[🤍🙂❤️]/gu,'').replace(/ +(?=\n|$)/g,''):text});
 const handoff=(reason:string)=>{state.mode='producer';state.handoffReason=reason;state.confirmed=false;say('Передам ваше питання продюсеру разом з історією замовлення 🤍 Подальші деталі він погодить із вами особисто. Можете додати повідомлення тут — вони збережуться для нього.');};
 if(message){
  state.messages.push({role:'user',text:message});
  const greeting=/^(?:привіт(?:ик)?|вітаю|добрий день|доброго дня|добрий вечір|доброго вечора|добрий ранок|доброго ранку|👋)(?=$|[\s,.!🤍😊👋])(?:[\s,.!🤍😊👋]*)/iu;
  const greeted=greeting.test(message.trim());
  message=message.trim().replace(greeting,'');

  if(state.mode!=='producer'){
   const edit=correction(message);
   if(greeted&&!message)say('Вітаю! 🤍 '+(next(state,order)||'Чим можу допомогти?'));
   else if(/^(?:(?:ви|ти)\s+(?:людина(?:\s+чи\s+бот)?|бот(?:\s+чи\s+людина)?|штучний інтелект)|це бот|хто ви)[?!.\s]*$/iu.test(message))say('Я Олена, AI-менеджер «Подаруй пісню». Допоможу зібрати історію, а за потреби передам розмову продюсеру.');
   else if(/продюсер|менеджер|оператор|людин[ау]|поверн.*(?:кошт|грош)|refund/iu.test(message))handoff('Клієнт просить особисте вирішення: '+message.slice(0,300));
   else if(/не сподобал|незадоволен|скарг/iu.test(message))handoff('Скарга на результат: '+message.slice(0,300));
   else if(/(?:я\s+)?(?:вже\s+)?(?:оплатив|оплатила|сплатив|сплатила)|квитанці/iu.test(message))handoff('Перевірити надходження оплати. Клієнт повідомив про платіж.');
   else if(edit){
    const keys:Record<string,string>={'дату':'eventDate','привід':'occasion','голос':'sound','настрій':'sound','історію':'story','імена':'sender','ім’я':'sender'};
    const key=keys[edit[1].toLowerCase()];const value=edit[2].trim();
    if(key){state.answers[key]=value;if(['eventDate','occasion','story'].includes(key))(order as unknown as Record<string,unknown>)[key]=value;}
    else order.recipient=value;
    state.confirmed=false;say('Зміни збережено 🤍 '+(next(state,order)||summary(state,order)));
   }
   else if(/(?:потрібн[ао]|встигн\S*|до|на)\s+(?:сьогодні|завтра)|^(?:сьогодні|завтра)[.!]?$|за (?:годину|дві години)/iu.test(message))handoff('Погодити термінове замовлення: '+message.slice(0,300));
   else if(/не знаю[ ,]*(?:з чого почати|що (?:розповісти|написати))|^(?:(?:я )?(?:ще )?не знаю|не впевнен[аи]?|важко сказати|підкажіть)[.!\s]*$/iu.test(message))say((greeted?'Вітаю! ':'')+'Вам не потрібно нічого вигадувати чи писати красиво. Згадайте, як познайомилися, за що любите цю людину або який спільний момент досі згадуєте з теплом. Я допоможу запитаннями, а ми перетворимо вашу історію на пісню. 🤍\n\n'+(next(state,order)||'З якого спогаду хотіли б почати?'));
   else if(isQuestion(message)){
    const answer=answerQuestion(message,order);
    if(answer)say(answer+'\n\n'+(next(state,order)||'Якщо деталі правильні, підтвердіть підсумок. Або напишіть, що змінити.'));
    else handoff('Потрібна відповідь на питання: '+message.slice(0,300));
   }else{
    const q=nextField(state);
    const details=explicitDetails(message);
    const tone=toneOf(message);
    const changedTone=tone!=='neutral'&&tone!==state.tone&&(tone==='memory'||state.tone!=='memory');
    if(changedTone)state.tone=tone;
    if((tone==='memory'||tone==='distance')&&!details.occasion&&!state.answers.occasion)details.occasion=tone==='memory'?'Пісня пам’яті':'Пісня підтримки';
    let captured=false;
    for(const [key,value] of Object.entries(details)){
     if(!value||state.answers[key]===value)continue;
     if(state.answers[key]&&key!=='sound'&&key!=='avoid')continue;
     state.answers[key]=value;captured=true;
     if(key==='occasion')order.occasion=value;
     if(key==='eventDate')order.eventDate=value;
     if(key==='story')order.story=value;
    }
    if(!Object.values(details).some(Boolean)&&q&&message.length>=3){
     state.answers[q.key]=message;captured=true;
     if(q.key==='occasion')order.occasion=message;
     if(q.key==='story')order.story=message;
    }
    if(captured)state.confirmed=false;
    const context=changedTone?reaction(tone):'';
    const timing=details.eventDate?'Перевіримо, чи зможемо підготувати пісню до цієї дати.':'';
    const preference=details.sound?'Побажання щодо звучання врахуємо.':'';
    const follow=next(state,order)||(state.confirmed?'Побажання збережено.':summary(state,order));
    say([context,timing,preference,follow].filter(Boolean).join(' '));
   }
  }
 }
 if(confirm&&state.mode==='assistant'&&!state.confirmed&&!next(state,order)){state.confirmed=true;say('Історію погоджено 🤍 '+payment(order)+' Після перевірки деталей тут з’явиться погоджене платіжне посилання.');}
 if(state.messages.length===1&&state.mode==='assistant'){
  if(state.tone==='memory')state.messages[0].text='Вітаю. Я Олена, AI-менеджер «Подаруй пісню». Мені шкода Вашої втрати. Допоможу дбайливо зібрати спогади для пісні.';
  say(next(state,order)||summary(state,order));
 }
 save(id,state,order,state.messages.length!==originalCount);
 db().exec('CREATE TABLE IF NOT EXISTS telegram_links(code TEXT PRIMARY KEY,orderId TEXT NOT NULL,chatId TEXT UNIQUE)');let link=db().prepare('SELECT code FROM telegram_links WHERE orderId=? LIMIT 1').get(id) as {code:string}|undefined;
 if(!link){link={code:randomBytes(24).toString('base64url')};db().prepare('INSERT INTO telegram_links(code,orderId) VALUES(?,?)').run(link.code,id);}
 return {telegramUrl:'https://t.me/podaruy_pisnyu_bot?start='+link.code,messages:state.messages,mode:state.mode,handoffReason:state.handoffReason,canConfirm:state.mode==='assistant'&&!next(state,order)&&!state.confirmed,confirmed:state.confirmed,paymentLink:state.mode==='assistant'&&state.confirmed?order.paymentLink:''};
})()}

export function saveTestFeedback(id:string,index:number,feedback:{replacement:string;reason:string}){
 if(process.env.LOCAL_ONLY!=='1')throw Error('TEST_ONLY');
 return db().transaction(()=>{
  const {state,order}=load(id);
  const message=state.messages[index];
  if(message?.role!=='assistant')throw Error('NOT_ASSISTANT_REPLY');
  message.feedback=feedback;
  save(id,state,order,true,true);
  return feedback;
 })();
}
