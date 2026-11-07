import {createHmac} from 'node:crypto';
import {telegramLink} from './telegram-links';
import {db} from './db';
import type {Order} from './model';
import type {Interpretation} from './olena-interpreter';
import {explicitDetails,reaction,storySignals,toneOf,type Tone} from './olena-context';

export function chatToken(id:string){return createHmac('sha256',process.env.SESSION_SECRET!).update('chat:'+id).digest('hex')}
export const questions=[
 {key:'narrator',label:'Від кого'},
 {key:'occasion',label:'Привід'},
 {key:'eventDate',label:'Дата подарунка'},
 {key:'sender',label:'Ім’я отримувача'},
 {key:'story',label:'Історія та головна думка'},
 {key:'sound',label:'Голос і настрій'},
 {key:'avoid',label:'Чого не згадувати'}
];
type Fact={value:string;source_message_id:number|null;confidence:number;status:'explicit'|'inferred'|'unconfirmed'};
type State={factHistory?:Record<string,Fact[]>;facts?:Record<string,Fact>;topic?:string;universal?:boolean;reviewed?:boolean;tone?:Tone;answers:Record<string,string>;messages:{role:'assistant'|'user';text:string;feedback?:{replacement:string;reason:string}}[];confirmed:boolean;mode:'assistant'|'producer';handoffReason?:string};
function load(id:string){
 db().exec('CREATE TABLE IF NOT EXISTS conversations(orderId TEXT PRIMARY KEY,body TEXT NOT NULL)');
 const row=db().prepare('SELECT body FROM orders WHERE id=?').get(id) as {body:string}|undefined;
 if(!row)throw Error('NOT_FOUND');
 const order=JSON.parse(row.body) as Order;
 const saved=db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}|undefined;
 const state:State=saved?JSON.parse(saved.body):{answers:{occasion:order.occasion,eventDate:order.eventDate,story:order.story},messages:[{role:'assistant',text:'Добрий день! Мене звати Олена, я цифрова помічниця команди «Подаруй пісню». Дякую, що звернулися до нас!'}],confirmed:false,mode:'assistant'};
 state.tone??=toneOf([state.answers.occasion,state.answers.story,order.recipient].join(' '));
 state.mode=order.communicationMode||state.mode||'assistant';
 return {order,state};
}
function readiness(s:State,o:Order){
 const story=s.answers.story||'';
 const {anchors,emotion}=storySignals(story);
 const ready=o.recipient!=='Не вказано'&&(o.plan==='own'?story.trim().split(/\s+/).length>=8:!!s.answers.narrator&&(s.universal||(!!s.answers.sender&&anchors>=2&&emotion)));
 return ready?(s.confirmed?'confirmed':'ready_for_review'):(story||s.topic?'developing':'insufficient');
}
function nextField(s:State,o:Order){
 if(o.recipient==='Не вказано')return 'recipient';
 if(o.plan==='own')return readiness(s,o)==='insufficient'||readiness(s,o)==='developing'?'story':undefined;
 if(!s.answers.occasion&&!s.answers.sender&&!s.answers.story&&!s.topic)return 'occasion';
 if(!s.answers.sender&&!s.topic&&!s.universal)return 'sender';
 const signals=storySignals(s.answers.story||'');
 if(!s.universal&&(signals.anchors<2||!signals.emotion))return 'story';
 if(!s.answers.narrator)return 'narrator';
}
function next(s:State,order:Order){
 const key=nextField(s,order);
 if(key==='recipient')return 'Для кого хотіли б створити пісню?';
 if(key==='occasion')return 'Є особлива нагода чи це сюрприз просто так?';
 if(key==='sender')return s.tone==='memory'?'Як звати людину, якій присвячуємо пісню, якщо Вам комфортно про це говорити?':'Як звати людину, для якої створюємо пісню?';
 if(key==='narrator')return 'Від чийого імені має звучати пісня — від Вашого чи від когось іще?';
 if(key==='story'){
  if(order.plan==='own')return 'Надішліть, будь ласка, Ваш текст.';
  if(s.tone==='memory')return 'Якщо Вам комфортно, яким спогадом про цю людину хотіли б поділитися в пісні?';
  if(s.topic==='діти')return 'Зрозуміла, у пісні важлива тема дітей. Який момент із дітьми або які слова про вашу сім’ю Ви хотіли б передати?';
  if(s.tone==='distance')return 'Які слова Ви найбільше хотіли б передати цією піснею?';
  const {anchors,emotion}=storySignals(s.answers.story||'');
  if(anchors>=2&&!emotion)return 'Яку головну думку Ви хотіли б передати цією піснею?';
  if(anchors||emotion||s.topic)return 'Яка маленька деталь чи спогад допоможе впізнати саме Вашу історію?';
  return 'Який спільний момент або почуття Вам хотілося б передати в пісні?';
 }
}
function payment(o:Order){return o.amount===200000?'Можна внести 1000 грн передоплати, а решту 1000 грн — після отримання готової пісні. Або оплатити всі 2000 грн одразу, як вам зручніше.':'Для цього формату — повна оплата 1000 грн перед початком роботи.'}
function summary(s:State,o:Order){
 s.reviewed=true;
 return `Перевірмо, чи я правильно зрозуміла Ваш задум. Кому: ${o.recipient}.\n${questions.filter(q=>s.answers[q.key]).map(q=>`${q.label}: ${s.answers[q.key]}`).join('\n')}${s.universal?'\nДомовилися про теплий варіант без додаткових особистих деталей.':''}\nУсе правильно? Після Вашого підтвердження розповім про оплату.`;
}

// Conservative, explicit routing. This is a scripted fallback, not a free-form AI model.
function answerQuestion(text:string,o:Order){
 const answers:string[]=[];
 if(/цін|вартіст|кошту|дорого|3000|знижк/iu.test(text))answers.push(`Обраний формат коштує ${o.amount/100} грн${o.plan==='own'?' після перегляду вашого тексту':''}. Пісню створюємо спеціально за Вашим задумом.`);
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
 db().prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify(feedbackOnly?{...order,notes,revision:order.revision+1}:{...order,communicationMode:state.mode,handoffReason:state.handoffReason||'',revision:order.revision+1,status:order.status==='Нове звернення'?'Збір інформації':order.status,nextAction:state.mode==='producer'?'Продюсеру: '+state.handoffReason:!['Нове звернення','Збір інформації'].includes(order.status)?order.nextAction:state.confirmed?'Перевірити погоджений бриф та оплату':'Переглянути діалог і доповнити бриф',notes}),id);
}
export function resumeConversation(id:string){return db().transaction(()=>{const {state,order}=load(id);state.mode='assistant';state.handoffReason=undefined;save(id,state,order,true);return {ok:true}})()}
export function dialogueContext(id:string,message?:string){
 const {state,order}=load(id);
 return {revision:order.revision,mode:state.mode,messages:state.messages.map(({role,text})=>({role,text})),facts:{...state.answers,recipient:order.recipient} as Record<string,string>,message:message??(state.messages.length===1?order.opening||'':'')};
}
export function conversation(id:string,message?:string,confirm=false,interpreted?:{revision:number;proposal:Interpretation}){return db().transaction(()=>{
 const {order,state}=load(id);if(readiness(state,order)!=='confirmed')state.confirmed=false;
 if(!message&&!confirm&&state.messages.length===1&&order.opening)message=order.opening;
 const originalCount=state.messages.length;const say=(text:string)=>state.messages.push({role:'assistant',text:state.tone==='memory'?text.replace(/[🤍🙂❤️]/gu,'').replace(/ +(?=\n|$)/g,''):text});
 const handoff=(reason:string)=>{state.mode='producer';state.handoffReason=reason;state.confirmed=false;say('Передам ваше питання продюсеру разом з історією замовлення 🤍 Подальші деталі він погодить із вами особисто. Можете додати повідомлення тут — вони збережуться для нього.');};
 if(message){
  state.messages.push({role:'user',text:message});
  order.lastInboundAt=new Date().toISOString();
  if(/не (?:пишіть|телефонуйте)(?: мені)?|не (?:зв[’'ʼ]язуйтеся|зв[’'ʼ]язуйтесь)|відпишіть мене/iu.test(message)){
   order.followupOptOut=true;
  }
  const greeting=/^(?:привіт(?:ик)?|вітаю|добрий день|доброго дня|добрий вечір|доброго вечора|добрий ранок|доброго ранку|👋)(?=$|[\s,.!🤍😊👋])(?:[\s,.!🤍😊👋]*)/iu;
  const greeted=greeting.test(message.trim());
  message=message.trim().replace(greeting,'');

  if(state.mode!=='producer'){
   const edit=correction(message);
   const recipientCorrection=message.match(/^(?:це )?не для [^,]+,?\s+а (?:пісня )?для ([\p{L}’' -]+)[.!]?$/iu)?.[1]?.trim();
   const remember=(key:string,value:string,status:Fact['status']='explicit')=>{
    const fact={value,source_message_id:state.messages.length-1,confidence:status==='explicit'?1:0.65,status};
    const history=state.factHistory??={};
    const previous=state.facts?.[key];
    const entries=history[key]??=(previous?[previous]:[]);
    entries.push(fact);
    (state.facts??={})[key]=fact;
   };
   const markChanged=()=>{state.confirmed=false;state.reviewed=false};
   if(greeted&&!message)say('Вітаю! 🤍 '+(next(state,order)||'Чим можу допомогти?'));
   else if(/^(?:(?:ви|ти)\s+(?:людина(?:\s+чи\s+бот)?|бот(?:\s+чи\s+людина)?|штучний інтелект)|це бот|хто ви)[?!.\s]*$/iu.test(message))say('Я Олена, цифрова помічниця команди «Подаруй пісню». Допоможу зібрати історію, а за потреби передам розмову продюсеру.');
   else if(/продюсер|менеджер|оператор|людин[ау]|поверн.*(?:кошт|грош)|refund/iu.test(message))handoff('Клієнт просить особисте вирішення: '+message.slice(0,300));
   else if(/не сподобал|незадоволен|скарг/iu.test(message))handoff('Скарга на результат: '+message.slice(0,300));
   else if(/(?:я\s+)?(?:вже\s+)?(?:оплатив|оплатила|сплатив|сплатила)|квитанці/iu.test(message))handoff('Перевірити надходження оплати. Клієнт повідомив про платіж.');
   else if(recipientCorrection){
    order.recipient=recipientCorrection;
    delete state.answers.sender;
    if(state.facts)delete state.facts.sender;
    remember('recipient',recipientCorrection);
    markChanged();
    say('Зрозуміла, змінила отримувача. '+(next(state,order)||summary(state,order)));
   }
   else if(edit){
    const keys:Record<string,string>={'дату':'eventDate','привід':'occasion','голос':'sound','настрій':'sound','історію':'story','імена':'sender','ім’я':'sender'};
    const key=keys[edit[1].toLowerCase()];const value=edit[2].trim();
    if(key){state.answers[key]=value;if(['eventDate','occasion','story'].includes(key))(order as unknown as Record<string,unknown>)[key]=value;}
    else order.recipient=value;
    remember(key||'recipient',value);markChanged();say('Зміни збережено. '+(next(state,order)||summary(state,order)));
   }
   else if(/(?:потрібн[ао]|встигн\S*|до|на)\s+(?:сьогодні|завтра)|^(?:сьогодні|завтра)[.!]?$|за (?:годину|дві години)/iu.test(message))handoff('Погодити термінове замовлення: '+message.slice(0,300));
   else if(/не знаю[ ,]*(?:з чого почати|що (?:розповісти|написати))|^(?:(?:я )?(?:ще )?не знаю|не впевнен[аи]?|важко сказати|підкажіть)[.!\s]*$/iu.test(message))say((greeted?'Вітаю! ':'')+'Вам не потрібно нічого вигадувати чи писати красиво. Згадайте, як познайомилися, за що любите цю людину або який спільний момент досі згадуєте з теплом. Я допоможу запитаннями, а ми перетворимо вашу історію на пісню. 🤍\n\n'+(next(state,order)||'З якого спогаду хотіли б почати?'));
   else if(/(?:не хочу|не готов[аий]*|не комфортно)\s+(?:розповідати|ділитися|називати)/iu.test(message))say('Не потрібно ділитися тим, чим Вам некомфортно. Можемо зробити теплу пісню з меншою кількістю особистих деталей. Якщо підходить, напишіть «Хочу універсальну пісню».');
   else if(isQuestion(message)){
    const answer=answerQuestion(message,order);
    if(answer)say(answer+'\n\n'+(next(state,order)||'Якщо деталі правильні, підтвердіть підсумок. Або напишіть, що змінити.'));
    else handoff('Потрібна відповідь на питання: '+message.slice(0,300));
   }else if(interpreted&&interpreted.revision===order.revision){
    const proposal=interpreted.proposal;
    let changed=false;
    for(const update of proposal.updates){
     if(!message.includes(update.evidence)||update.value.length>(['story'].includes(update.field)?15000:100))continue;
     const previous=update.field==='recipient'?order.recipient:state.answers[update.field];
     const known=previous&&previous!=='Не вказано';
     if(known&&previous!==update.value&&!update.correction&&!['story','sound','avoid'].includes(update.field))continue;
     const value=update.field==='story'&&!update.correction&&previous?[previous,update.value].join('\n'):update.value;
     if(previous===value)continue;
     if(update.field==='recipient'){
      order.recipient=value;
      if(known&&update.correction){delete state.answers.sender;if(state.facts)delete state.facts.sender;}
     }else{
      state.answers[update.field]=value;
      if(['occasion','eventDate','story'].includes(update.field))(order as unknown as Record<string,unknown>)[update.field]=value;
     }
     remember(update.field,value);changed=true;
    }
    if(changed)markChanged();
    state.tone=toneOf([state.answers.occasion,state.answers.story,message].join(' '));
    if(proposal.action==='handoff')handoff('Потрібна допомога продюсера');
    else if(proposal.action==='summarize')say(readiness(state,order)==='ready_for_review'?summary(state,order):next(state,order)||'Який особистий спогад хочете передати в пісні?');
    else{
     const unsafe=/грн|₴|долар|євро|paypal|оплат|передоплат|рахунок|картк|реквізит|знижк|годин|днів|https?:|погоджено|підтверджено/iu.test(proposal.reply);
     say(unsafe?(next(state,order)||summary(state,order)):proposal.reply);
    }
   }else{
    const field=nextField(state,order);
    const details=explicitDetails(message);
    const tone=toneOf(message);
    const changedTone=tone!=='neutral'&&tone!==state.tone&&(tone==='memory'||state.tone!=='memory');
    if(changedTone)state.tone=tone;
    // A genitive beloved is a recipient only after «для», never after «від».
    const recipientText=message;
    const recipientMatch=Array.from(recipientText.matchAll(/(?:^|\s)(дружині|дружини|чоловікові|чоловіку|мамі|мами|матусі|матуся|тат[уі]|тата|батькові|бабусі|дідусеві|подрузі|другові|доньці|синові|колезі|команді|коханому|коханій|коханого|коханої)(?=$|[\s,!.])/giu)).find(match=>{
     const prefix=recipientText.slice(0,match.index).trimEnd();
     if(/(?:^|\s)від$/iu.test(prefix))return false;
     return !/^кохан(?:ого|ої)$/iu.test(match[1])||/(?:^|\s)для$/iu.test(prefix);
    });
    const relation=recipientMatch?.[1];
    const recipientName=recipientMatch?message.slice(recipientMatch.index!+recipientMatch[0].length).match(/^\s+([А-ЯІЇЄҐ][а-яіїєґ’'ʼ-]+)(?=$|[\s,!.])/u)?.[1]:undefined;
    if(relation&&order.recipient==='Не вказано'){order.recipient=relation;remember('recipient',relation);markChanged();}
    if(recipientName&&!state.answers.sender)details.sender=recipientName;
    const narrator=message.match(/(?:від мого імені|від мене|від (?:дружини|чоловіка|дітей|доньки|сина|родини|коханого|коханої))(?=$|[\s,.!])/iu)?.[0];
    if(narrator){state.answers.narrator=narrator;remember('narrator',narrator);markChanged();}
    if((tone==='memory'||tone==='distance')&&!details.occasion&&!state.answers.occasion){details.occasion=tone==='memory'?'Пісня пам’яті':'Пісня підтримки';remember('occasion',details.occasion,'inferred');}
    let captured=false;
    for(const [key,value] of Object.entries(details)){
     if(!value||state.answers[key]===value)continue;
     if(state.answers[key]&&!['story','sound','avoid'].includes(key))continue;
     const saved=key==='story'&&state.answers.story?state.answers.story+'\n'+value:value;
     state.answers[key]=saved;captured=true;
     if(!(key==='occasion'&&state.facts?.occasion?.source_message_id===state.messages.length-1))remember(key,value);
     if(key==='occasion')order.occasion=saved;
     if(key==='eventDate')order.eventDate=saved;
     if(key==='story')order.story=saved;
    }
    const topic=/^(?:дітей|діти|про дітей|про сім[’'ʼ]ю|сім[’'ʼ]я)[.!\s]*$/iu.test(message)?'діти':/^(?:\d+\s+років|любов|вдячність|підтримка)[.!\s]*$/iu.test(message)?message:undefined;
    if(topic){state.topic=topic;remember('topic',message);markChanged();}
    else if(/^(?:хочу|обираю|погоджуюся на) (?:більш )?універсальн\S* (?:пісню|варіант)[.!]?$/iu.test(message)){state.universal=true;markChanged();}
    else if(!captured&&!relation&&!narrator&&!Object.values(details).some(Boolean)&&field&&message.length>=2){
     if(field==='recipient'){order.recipient=message;remember('recipient',message);}
     else if(field==='story'){
      state.answers.story=[state.answers.story,message].filter(Boolean).join('\n');order.story=state.answers.story;remember('story',message);
     }else{
      state.answers[field]=message;remember(field,message);
      if(field==='occasion')order.occasion=message;
     }
     captured=true;
    }
    if(captured)markChanged();
    const remembered=details.story?.match(/(?:познайомилися|зустрілися) (?:в|у) [\p{L}’'-]+/iu)?.[0];
    const context=remembered&&state.tone!=='memory'?'Ви '+remembered+' — це деталь, яка зробить пісню впізнаваною.':changedTone?reaction(tone):/^просто так[.!]?$/iu.test(message)?'Пісня без приводу — теплий сюрприз.':'';
    const timing=details.eventDate?'Перевіримо, чи зможемо підготувати пісню до цієї дати.':'';
    const preference=details.sound?'Побажання щодо звучання врахуємо.':'';
    const follow=next(state,order)||(state.confirmed?'Дякую, врахуємо Ваші побажання.':summary(state,order));
    say([context,timing,preference,follow].filter(Boolean).join(' '));
   }
  }
 }
 if(confirm&&!message&&state.mode==='assistant'&&!state.confirmed&&state.reviewed&&readiness(state,order)==='ready_for_review'){state.confirmed=true;say('Історію погоджено. Вартість — '+order.amount/100+' грн. '+payment(order)+' Після перевірки деталей тут з’явиться погоджене платіжне посилання.');}
 if(state.messages.length===1&&state.mode==='assistant'){
  if(state.tone==='memory')state.messages[0].text='Вітаю. Я Олена, цифрова помічниця команди «Подаруй пісню». Мені шкода Вашої втрати. Допоможу дбайливо зібрати спогади для пісні.';
  say(next(state,order)||summary(state,order));
 }
 save(id,state,order,state.messages.length!==originalCount);
 const link=telegramLink(id);
 return {telegramUrl:'https://t.me/podaruy_pisnyu_bot?start='+link.code,messages:state.messages,mode:state.mode,handoffReason:state.handoffReason,storyReadiness:readiness(state,order),canConfirm:state.mode==='assistant'&&state.reviewed===true&&readiness(state,order)==='ready_for_review',confirmed:readiness(state,order)==='confirmed',paymentLink:state.mode==='assistant'&&readiness(state,order)==='confirmed'?order.paymentLink:''};
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
