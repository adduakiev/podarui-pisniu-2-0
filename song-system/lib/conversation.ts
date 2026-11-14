import {unsupportedDeliveryReply} from './olena-delivery-reply';
import {mandatoryInstructionKind,mandatoryBrief,type MandatoryInstruction} from './olena-mandatory-brief';
import {naturalEventDateCorrection,explicitEventDateWithdrawal} from './olena-date-correction';
import {askedQuestionField} from './olena-question-context';
import {unsupportedFinancialReply,financialReplyText} from './olena-financial-reply';
import {escalationReason,declinesHandoff,requestsOrderCancellation,requestsNoContact,dialogueGreeting} from './olena-escalation';
import {supportedFactUpdate} from './olena-fact-evidence';
import {dialogueCapabilities,replyViolation} from './olena-reply-contract';
import {createHmac,randomUUID} from 'node:crypto';
import {telegramLink} from './telegram-links';
import {db,createOrder} from './db';
import type {Order} from './model';
import type {Interpretation} from './olena-interpreter';
import {explicitDetails,correctedRelationshipStory,reaction,storySignals,toneOf,type Tone} from './olena-context';

export function chatToken(id:string){return createHmac('sha256',process.env.SESSION_SECRET!).update('chat:'+id).digest('hex')}
export const questions=[
 {key:'narrator',label:'Від кого'},
 {key:'occasion',label:'Привід'},
 {key:'eventDate',label:'Дата подарунка'},
 {key:'sender',label:'Ім’я отримувача'},
 {key:'story',label:'Історія та головна думка'},
 {key:'sound',label:'Голос і настрій'},
 {key:'avoid',label:'Чого не згадувати'},
 {key:'mandatoryDetails',label:'Обов’язкові побажання та уточнення клієнта'}
];
type Fact={source_field?:'story';source?:'form'|'message'|'landing';source_page?:Order['source_page'];value:string;source_message_id:number|null;confidence:number;status:'explicit'|'inferred'|'unconfirmed'|'legacy_unknown'};
type State={pauseAcknowledgementIndex?:number;avoidRestrictions?:Fact[];mandatoryInstructions?:MandatoryInstruction[];repeatPending?:string;factHistory?:Record<string,Fact[]>;facts?:Record<string,Fact>;topic?:string;universal?:boolean;reviewed?:boolean;tone?:Tone;answers:Record<string,string>;messages:{role:'assistant'|'user';text:string;feedback?:{replacement:string;reason:string}}[];confirmed:boolean;mode:'assistant'|'producer';handoffReason?:string};
function addAvoidance(state:State,value:string){
 const previous:Fact|undefined=state.facts?.avoid??(state.answers.avoid?{value:state.answers.avoid,source_message_id:null,confidence:0,status:'legacy_unknown'}:undefined);
 // Seed only the current legacy value, never historical/superseded restrictions.
 const entries=state.avoidRestrictions??=(previous?.value&&previous.status!=='unconfirmed'?[{...previous}]:[]);
 const existing=entries.findIndex(entry=>entry.value===value);
 if(existing>=0&&entries[existing].status!=='legacy_unknown'){state.answers.avoid=entries.map(entry=>entry.value).join('\n');return;}
 const entry:Fact={value,source:'message',source_message_id:state.messages.length-1,confidence:1,status:'explicit'};
 if(existing>=0)entries[existing]=entry;else entries.push(entry);
 const combined=entries.map(entry=>entry.value).join('\n');
 // An aggregate has multiple sources; never attribute all items to the latest turn.
 const unknown=entries.some(item=>item.status==='legacy_unknown');
 const fact:Fact=entries.length===1?entry:{value:combined,source_message_id:null,confidence:unknown?0:1,status:unknown?'legacy_unknown':'explicit'};
 const history=state.factHistory??={};const snapshots=history.avoid??=(previous?[previous]:[]);
 if(previous?.status==='legacy_unknown'&&!snapshots.some(item=>item.status==='legacy_unknown'&&item.value===previous.value))snapshots.push(previous);
 snapshots.push(fact);
 (state.facts??={}).avoid=fact;state.answers.avoid=combined;state.confirmed=false;state.reviewed=false;
}
function directAvoidance(message:string){
 // Explicit non-use of a quoted lyric line is a content restriction, not a
 // request to delete the source text. Do not broaden generic "не використовуйте".
 const excludedLine=message.match(/^не використовуйте\s+(рядок\s+«[^»\n]+»\s+у пісні)(?:[.!](?=\s|$)|$)/iu)?.[1];
 if(excludedLine)return excludedLine;

 const first=message.match(/^(?:не називайте|не згадуйте|не згадувати|без згадки про)\s+[^.!?]+(?:[.!]|$)/iu)?.[0];
 return first?explicitDetails(first).avoid:undefined;
}
function captureMandatoryInstruction(state:State,message:string){
 const kind=mandatoryInstructionKind(message,!!state.mandatoryInstructions?.length);
 if(!kind||kind==='amendment'&&!state.mandatoryInstructions?.length)return false;
 const source_message_id=state.messages.length-1;
 (state.mandatoryInstructions??=[]).push({text:message,source:'message',source_message_id,kind});
 const value=mandatoryBrief(state.mandatoryInstructions);
 const fact:Fact={value,source:'message',source_message_id,confidence:1,status:'explicit'};
 const previous=state.facts?.mandatoryDetails;
 const history=state.factHistory??={};
 (history.mandatoryDetails??=(previous?[previous]:[])).push(fact);
 (state.facts??={}).mandatoryDetails=fact;state.answers.mandatoryDetails=value;
 state.confirmed=false;state.reviewed=false;return true;
}
function load(id:string){
 db().exec('CREATE TABLE IF NOT EXISTS conversations(orderId TEXT PRIMARY KEY,body TEXT NOT NULL)');
 const row=db().prepare('SELECT body FROM orders WHERE id=?').get(id) as {body:string}|undefined;
 if(!row)throw Error('NOT_FOUND');
 const order=JSON.parse(row.body) as Order;
 const saved=db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as {body:string}|undefined;
 const state:State=saved?JSON.parse(saved.body):{answers:{occasion:order.occasion,eventDate:order.eventDate,story:order.story},messages:[{role:'assistant',text:'Добрий день! Мене звати Олена, я цифрова помічниця команди «Подаруй пісню». Дякую, що звернулися до нас!'}],confirmed:false,mode:'assistant'};
 if(!saved){
  state.facts={};
  // Only direct instructions in new normal-story intake; own-plan text may be lyrics.
  if(order.plan!=='own'&&mandatoryInstructionKind(order.story)==='instruction'){
   state.mandatoryInstructions=[{text:order.story,kind:'instruction',source:'form',source_field:'story',source_page:order.source_page,source_message_id:null}];
   const value=mandatoryBrief(state.mandatoryInstructions);state.answers.mandatoryDetails=value;
   state.facts.mandatoryDetails={value,source:'form',source_field:'story',source_page:order.source_page,source_message_id:null,confidence:1,status:'explicit'};
  }

  for(const [key,value] of Object.entries({recipient:order.recipient,occasion:order.occasion,eventDate:order.eventDate,story:order.story})){
   if(value&&value!=='Не вказано')state.facts[key]={value,source:'form',source_page:order.source_page,source_message_id:null,confidence:1,status:'explicit'};
  }
 }
 // Landing hints are retained as provenance, never promoted to customer facts.
 if(!saved&&order.landing_defaults){
  for(const [key,value] of Object.entries(order.landing_defaults)){
   if(value)state.facts![key]={value,source_page:order.source_page,source_message_id:null,confidence:0.35,status:'unconfirmed'};
  }
 }
 state.tone??=toneOf([state.answers.occasion,state.answers.story,order.recipient].join(' '));
 state.mode=order.contactPaused?'producer':order.communicationMode||state.mode||'assistant';
 return {order,state};
}
function readiness(s:State,o:Order){
 const story=s.answers.story||'';
 const {anchors,emotion}=storySignals(story);
 const ready=o.recipient!=='Не вказано'&&(o.plan==='own'?story.trim().split(/\s+/).length>=8:!!s.answers.narrator&&(s.universal||(!!s.answers.sender&&anchors>=1&&emotion)));
 return ready?(s.confirmed?'confirmed':'ready_for_review'):(story||s.topic?'developing':'insufficient');
}
function nextField(s:State,o:Order){
 if(o.recipient==='Не вказано')return 'recipient';
 if(o.plan==='own')return readiness(s,o)==='insufficient'||readiness(s,o)==='developing'?'story':undefined;
 if(!s.answers.occasion&&!s.answers.sender&&!s.answers.story&&!s.topic)return 'occasion';
 if(!s.answers.sender&&!s.topic&&!s.universal)return 'sender';
 const signals=storySignals(s.answers.story||'');
 if(!s.universal&&(signals.anchors<1||!signals.emotion))return 'story';
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
  if(anchors>=1&&!emotion)return 'Яку головну думку Ви хотіли б передати цією піснею?';
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
 const paymentExplanationDeclined=/(?:^|[.!?;,]\s*)(?:(?:про\s+)?оплату\s+(?:(?:поки|зараз)\s+)?не\s+(?:розповідайте|пояснюйте|говоріть)|не\s+(?:розповідайте|пояснюйте|говоріть)\s+(?:(?:поки|зараз)\s+)?(?:про\s+)?оплату)(?=$|[\s.!?;,])/iu.test(text);
 if(/цін|вартіст|кошту|дорого|3000|знижк/iu.test(text))answers.push(`Обраний формат коштує ${o.amount/100} грн${o.plan==='own'?' після перегляду вашого тексту':''}. Пісню створюємо спеціально за Вашим задумом.`);
 if(!paymentExplanationDeclined&&/оплат|передоплат|аванс|реквізит/iu.test(text))answers.push(payment(o)+' Реквізити або посилання на оплату надамо після погодження замовлення.');
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
 db().prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify(feedbackOnly?{...order,notes,revision:order.revision+1}:{...order,communicationMode:state.mode,handoffReason:state.handoffReason||'',revision:order.revision+1,status:order.status==='Нове звернення'&&!order.contactPaused&&!state.handoffReason?.startsWith('Запит на скасування замовлення:')?'Збір інформації':order.status,nextAction:state.mode==='producer'?'Продюсеру: '+state.handoffReason:!['Нове звернення','Збір інформації'].includes(order.status)?order.nextAction:state.confirmed?'Перевірити погоджений бриф та оплату':'Переглянути діалог і доповнити бриф',notes}),id);
}
export function resumeConversation(id:string,revision?:number){return db().transaction(()=>{id=activeOrderId(id);const {state,order}=load(id);if(revision!==undefined&&revision!==order.revision)throw Error('CONFLICT');if(order.contactPaused)throw Error('CONTACT_REACTIVATION_REQUIRES_CONSENT');state.mode='assistant';state.handoffReason=undefined;save(id,state,order,true);return {ok:true}})()}
export function takeoverConversation(id:string,revision:number,reason:string){return db().transaction(()=>{id=activeOrderId(id);const {state,order}=load(id);if(order.revision!==revision)throw Error('CONFLICT');state.mode='producer';state.handoffReason=reason;state.confirmed=false;save(id,state,order,true);return {ok:true}})()}
export function dialogueContext(id:string,message?:string){
 id=activeOrderId(id);
 const {state,order}=load(id);
 const facts=Object.fromEntries(Object.entries({...state.answers,recipient:order.recipient}).filter(([key])=>state.facts?.[key]?.status!=='unconfirmed'));
 return {capabilities:dialogueCapabilities,orderId:id,status:order.status,contactPaused:!!order.contactPaused,completed:order.status==='Завершено',revision:order.revision,mode:state.mode,ownerReferences:state.messages.flatMap((m,index)=>m.feedback?[{source_message_id:index,replacement:m.feedback.replacement,reason:m.feedback.reason}]:[]),messages:state.messages.map(({role,text})=>({role,text})),facts,factMetadata:state.facts||{},avoidanceSources:state.avoidRestrictions||[],message:message??(state.messages.length===1?order.opening||'':'')};
}
function conversationTurn(id:string,message?:string,confirm=false,interpreted?:{revision:number;proposal:Interpretation},stale=false){return db().transaction(()=>{
 const {order,state}=load(id);if(readiness(state,order)!=='confirmed')state.confirmed=false;
 if(!message&&!confirm&&state.messages.length===1&&order.opening)message=order.opening;
 const originalCount=state.messages.length;
 const previousAssistant=state.messages.at(-1);
 const askedField=previousAssistant?.role==='assistant'?askedQuestionField(previousAssistant.text):undefined;
 const say=(text:string)=>state.messages.push({role:'assistant',text:state.tone==='memory'?text.replace(/[🤍🙂❤️]/gu,'').replace(/ +(?=\n|$)/g,''):text});
 const handoff=(reason:string)=>{state.mode='producer';state.handoffReason=reason;state.confirmed=false;say(requestsOrderCancellation(message||'')?'Ваш запит на скасування збережено для продюсера. Рішення щодо замовлення він має погодити з Вами; автоматичні нагадування про замовлення вимкнено.':'Передам ваше питання продюсеру разом з історією замовлення 🤍 Подальші деталі він погодить із вами особисто. Можете додати повідомлення тут — вони збережуться для нього.');};
 if(message){
  state.messages.push({role:'user',text:message});
  order.lastInboundAt=new Date().toISOString();
  if(requestsNoContact(message)){
   const transition=!order.contactPaused;order.contactPaused=true;order.followupOptOut=true;state.mode='producer';state.handoffReason='Клієнт просить не писати. Поновлення потребує окремої згоди.';state.repeatPending=undefined;state.confirmed=false;state.reviewed=false;
   if(transition){say('Зрозуміла. Автоматичні повідомлення для цієї заявки призупинено.');state.pauseAcknowledgementIndex=state.messages.length-1;}
  }
  if(requestsOrderCancellation(message))order.followupOptOut=true;
  if(/не (?:пишіть|телефонуйте)(?: мені)?|не (?:зв[’'ʼ]язуйтеся|зв[’'ʼ]язуйтесь)|відпишіть мене/iu.test(message)){
   order.followupOptOut=true;
  }
  const greeting=dialogueGreeting;
  const greeted=greeting.test(message.trim());
  message=message.trim().replace(greeting,'');

  const directAvoid=directAvoidance(message);
  if(directAvoid&&!stale&&!order.contactPaused)addAvoidance(state,directAvoid);
  // A locked producer receives direct instructions without resuming replies or model inference.
  if(state.mode==='producer'&&!stale&&!order.contactPaused)captureMandatoryInstruction(state,message);
  if(state.mode!=='producer'){
   const mandatoryKind=mandatoryInstructionKind(message,!!state.mandatoryInstructions?.length);
   const edit=correction(message);
   const dateCorrection=naturalEventDateCorrection(message,state.answers.eventDate||order.eventDate||'');
   const correctedStory=correctedRelationshipStory(message,state.answers.story||'');
   const recipientCorrection=message.match(/^(?:це )?не для [^,]+,?\s+а (?:пісня )?для ([\p{L}’' -]+)[.!]?$/iu)?.[1]?.trim()||message.match(/^ні[,!]?\s+(?:пісня )?для ([\p{L}’' -]+)[.!]?$/iu)?.[1]?.trim();
   const occasionCorrection=message.match(/^(?:це )?не (?:на|до) [^,]+,?\s+а (?:на|до) ([^.!?]+)[.!]?$/iu)?.[1]?.trim();
   const provisional=(key:string)=>state.facts?.[key]?.status==='unconfirmed';
   const remember=(key:string,value:string,status:Fact['status']='explicit',confidence=status==='explicit'?1:0.65)=>{
    if(key==='avoid'){addAvoidance(state,value);return;}
    const fact={value,source:'message' as const,source_message_id:state.messages.length-1,confidence,status};
    const history=state.factHistory??={};
    const previous=state.facts?.[key];
    const entries=history[key]??=(previous?[previous]:[]);
    entries.push(fact);
    (state.facts??={})[key]=fact;
   };
   const markChanged=()=>{state.confirmed=false;state.reviewed=false};
   const captureMandatory=()=>captureMandatoryInstruction(state,message!);
   if(stale&&escalationReason(message))handoff(escalationReason(message)!);
   else if(stale){
    // Preserve the late inbound, but never replay its correction or interpretation
    // against newer state. Backend factual questions remain answerable.
    const answer=isQuestion(message)?answerQuestion(message,order):'';
    say(answer||'Повідомлення збережено. Після нього вже надійшли новіші уточнення, тому поточні деталі залишаю без змін.');
   }
   else if(greeted&&!message)say('Вітаю! 🤍 '+(next(state,order)||'Чим можу допомогти?'));
   else if(/^(?:(?:ви|ти)\s+(?:людина(?:\s+чи\s+бот)?|бот(?:\s+чи\s+людина)?|штучний інтелект)|це бот|хто ви)[?!.\s]*$/iu.test(message))say('Я Олена, цифрова помічниця команди «Подаруй пісню». Допоможу зібрати історію, а за потреби передам розмову продюсеру.');
   else if(escalationReason(message)){captureMandatory();handoff(escalationReason(message)!);}
   else if(!interpreted&&order.plan!=='own'&&((askedField==='sender'&&(/^(?:звати\s+)?[\p{L}’'ʼ-]+[.!]?$/iu.test(message)||/^(?:не знаю|не пам[’'ʼ]ятаю|не визначено|не впевнен(?:ий|а))[.!]?$/iu.test(message)))||(askedField==='story'&&(/^(?:перша\s+(?:прогулянка|зустріч|подорож)|наш\s+перший\s+поцілунок)[.!]?$/iu.test(message)||/^(?:щось гарне|не знаю|не пам[’'ʼ]ятаю)[.!]?$/iu.test(message))))){
    const name=askedField==='sender'?message.replace(/^звати\s+/iu,'').replace(/[.!]$/u,''):undefined;
    const validName=!!name&&/^[А-ЯІЇЄҐ][а-яіїєґ’'ʼ-]+$/u.test(name)&&! /^(?:Пісня|Замовлення|Так|Ні|Добре|Гаразд|Можливо|Невідомо|Мабуть|Напевно)$/u.test(name);
    const memory=askedField==='story'&&!/^(?:щось гарне|не знаю|не пам[’'ʼ]ятаю)/iu.test(message);
    if(validName){state.answers.sender=name!;remember('sender',name!);markChanged();say(next(state,order)||summary(state,order));}
    else if(memory){state.answers.story=[state.answers.story,message].filter(Boolean).join('\n');order.story=state.answers.story;remember('story',message);markChanged();say('Цей спогад збережено. Які слова чи почуття Ви хочете передати цією піснею?');}
    else{
     const clarification=askedField==='sender'?"Потрібне лише ім’я отримувача, без слова «звати». Як звати людину, для якої пісня?":"Потрібен один конкретний спогад, наприклад місце або спільна подія. Який спогад хотіли б зберегти?";
     if(previousAssistant?.text===clarification)handoff('Не вдалося уточнити '+(askedField==='sender'?"ім’я отримувача":"спогад")+'. Потрібна допомога продюсера.');
     else say(clarification);
    }
   }
   else if(order.plan==='own'&&nextField(state,order)==='story'&&previousAssistant?.role==='assistant'&&/Надішліть, будь ласка, Ваш текст\./u.test(previousAssistant.text)&&/^Ось текст пісні:\s*\n\s*\S/iu.test(message)){
    // Explicitly submitted lyrics answer the actual own-text request. Treat the
    // complete original message as text, never extract its lines as brief facts.
    const supplied=state.messages.at(-1)!.text;
    state.answers.story=supplied;order.story=supplied;remember('story',supplied);markChanged();
    say('Ваш текст збережено дослівно. Його ще має переглянути продюсер; це не означає погодження чи початок роботи.');
   }
   else if(/^(?:скасуйте|приберіть|зніміть)\s+(?:попередню\s+|цю\s+)?заборону[.!]?$/iu.test(message))handoff('Уточнити скасування заборони: '+message);
   else if(mandatoryKind){
    if(mandatoryKind==='amendment'&&!state.mandatoryInstructions?.length){
     say('Уточніть, будь ласка, які саме обов’язкові побажання та їхній порядок потрібно передати продюсеру. Поки не припускаю, що саме змінюється.');
    }else{
     captureMandatory();
     const answer=directAvoid&&isQuestion(message)?answerQuestion(message,order):'';
     if(directAvoid&&isQuestion(message)&&!answer)handoff('Потрібна відповідь на питання: '+message.slice(0,300));
     else say(answer||'Зберегла Ваші побажання дослівно в окремому розділі брифу. Новіші уточнення мають перевагу над попередніми; неоднозначні деталі уточнить продюсер.');
    }
   }
   else if(recipientCorrection){
    order.recipient=recipientCorrection;
    delete state.answers.sender;
    if(state.facts)delete state.facts.sender;
    remember('recipient',recipientCorrection);
    markChanged();
    say('Зрозуміла, змінила отримувача. '+(next(state,order)||summary(state,order)));
   }
   else if(occasionCorrection){
    order.occasion=occasionCorrection;state.answers.occasion=occasionCorrection;
    remember('occasion',occasionCorrection);markChanged();
    say('Зрозуміла, змінила привід. '+(next(state,order)||summary(state,order)));
   }
   else if(explicitEventDateWithdrawal(message)){
    order.eventDate='';state.answers.eventDate='';remember('eventDate','','unconfirmed',0);markChanged();
    say('Прибрала попередню дату свята з поточних деталей. Нову дату можна уточнити пізніше. Інші деталі замовлення залишаються без змін.');
   }
   else if(dateCorrection!==undefined){
    if(dateCorrection===null)say('Уточніть, будь ласка, точну нову дату свята й яку попередню дату замінити. Поки залишаю дату та інші деталі без змін.');
    else{order.eventDate=dateCorrection;state.answers.eventDate=dateCorrection;remember('eventDate',dateCorrection);markChanged();say('Дякую за уточнення, дату свята виправлено. '+(next(state,order)||summary(state,order)));}
   }
   else if(correctedStory){
    state.answers.story=correctedStory;order.story=correctedStory;
    remember('story',correctedStory);markChanged();
    say('Дякую за уточнення, тривалість виправлено. '+(next(state,order)||summary(state,order)));
   }
   else if(correctedStory===null){
    say('Уточніть, будь ласка, яку саме згадку про тривалість стосунків слід виправити. Інші деталі залишаю без змін.');
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
    // Recipient changes invalidate the old dependent name. Apply that parent
    // field first inside this transaction, then validate/apply the supplied name.
    // Sorting a copy leaves the interpreter proposal and unrelated fields intact.
    const currentMessage=message;
    const parents=proposal.updates.filter(update=>update.field==='recipient');
    const conflictingParents=new Set(parents.filter(update=>supportedFactUpdate(update,currentMessage,askedField)).map(update=>update.value.normalize('NFKC').toLocaleLowerCase('uk').replace(/[’ʼ]/gu,"'").trim())).size>1;
    const unresolvedParent=conflictingParents||parents.some(update=>!supportedFactUpdate(update,currentMessage,askedField)||update.value.length>100||order.recipient!=='Не вказано'&&!provisional('recipient')&&order.recipient!==update.value&&!update.correction);
    const updates=[...proposal.updates].sort((a,b)=>Number(b.field==='recipient')-Number(a.field==='recipient'));
    for(const update of updates){
     // A name referring to the rejected new person cannot relabel the old one.
     if(unresolvedParent&&['recipient','sender'].includes(update.field))continue;
     if(!supportedFactUpdate(update,message,askedField)||update.value.length>(['story'].includes(update.field)?15000:100))continue;
     const previous=update.field==='recipient'?order.recipient:state.answers[update.field];
     const known=previous&&previous!=='Не вказано';
     if(known&&!provisional(update.field)&&previous!==update.value&&!update.correction&&!['story','sound','avoid'].includes(update.field))continue;
     const value=update.field==='story'&&!update.correction&&previous?[previous,update.value].join('\n'):update.value;
     if(previous===value&&!provisional(update.field))continue;
     if(update.field==='recipient'){
      order.recipient=value;
      if(known&&update.correction){delete state.answers.sender;if(state.facts)delete state.facts.sender;}
     }else{
      if(update.field!=='avoid')state.answers[update.field]=value;
      if(['occasion','eventDate','story'].includes(update.field))(order as unknown as Record<string,unknown>)[update.field]=value;
     }
     remember(update.field,value);changed=true;
    }
    if(changed)markChanged();
    state.tone=toneOf([state.answers.occasion,state.answers.story,message].join(' '));
    if(proposal.action==='handoff'&&!declinesHandoff(message))handoff('Потрібна допомога продюсера');
    else if(conflictingParents)say('Уточніть, будь ласка, для кого створюємо пісню. Попереднього отримувача та ім’я залишаю без змін.');
    else if(proposal.action==='handoff')say(next(state,order)||'Продовжимо тут. Які деталі хотіли б уточнити?');
    else if(proposal.action==='summarize')say(readiness(state,order)==='ready_for_review'?summary(state,order):next(state,order)||'Який особистий спогад хочете передати в пісні?');
    else{
     const paid=(db().prepare('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE orderId=?').get(id) as {total:number}).total;
     const financialState={paid,amount:order.amount,confirmed:readiness(state,order)==='confirmed',status:order.status};
     const reply=financialReplyText(proposal.reply,financialState);
     const unsafe=unsupportedDeliveryReply(reply,order.status)||unsupportedFinancialReply(reply,financialState)||!!replyViolation(proposal.reply)||/грн|₴|долар|євро|paypal|оплат|передоплат|рахунок|картк|реквізит|знижк|годин|днів|https?:/iu.test(reply);
     say(unsafe?(next(state,order)||summary(state,order)):reply);
    }
   }else{
    const field=askedField;
    const details=explicitDetails(message);
    // A denied occasion cannot become positive evidence or keep a landing default.
    const denied=message.match(/(?:^|[.!?]\s*)не\s+(?:на|до)\s+([^.!?]+)/iu)?.[1]?.trim();
    if(denied&&state.answers.occasion){
     const normalize=(value:string)=>value.toLowerCase().replace(/^(?:на|до)\s+/u,'').trim();
     if(normalize(state.answers.occasion)===normalize(denied)){
      state.answers.occasion='';order.occasion='';remember('occasion','');markChanged();
     }
    }
    const tone=toneOf(message);
    const changedTone=tone!=='neutral'&&tone!==state.tone&&(tone==='memory'||state.tone!=='memory');
    if(changedTone)state.tone=tone;
    // A genitive beloved is a recipient only after «для», never after «від».
    const recipientText=message;
    const recipientMatch=Array.from(recipientText.matchAll(/(?:^|\s)(сестрі|сестри|братові|брату|брата|дружині|дружини|чоловікові|чоловіку|мамі|мами|матусі|матуся|тат[уі]|тата|батькові|бабусі|дідусеві|подрузі|другові|доньці|синові|колезі|команді|коханому|коханій|коханого|коханої)(?=$|[\s,!.])/giu)).find(match=>{
     const prefix=recipientText.slice(0,match.index).trimEnd();
     const suffix=recipientText.slice(match.index!+match[0].length);
     const standalone=!prefix&&/^(?:\s+[А-ЯІЇЄҐ][а-яіїєґ’'ʼ-]+)?[.!]?\s*$/u.test(suffix);
     if(/^(?:сестр[іи]|братові|брату|брата)$/iu.test(match[1])){
      // Sibling words alone do not establish a recipient role in a story.
      // Limit new forms to a direct positive request or literal short answer.
      if(/^(?:сестри|брата)$/iu.test(match[1])&&!/(?:^|\s)для(?:\s+(?:моєї|нашої|своєї|мого|нашого|свого))?$/iu.test(prefix))return false;
      const clausePrefix=prefix.split(/[.!?;]/u).at(-1)!.trim();
      const direct=/^(?:(?:привіт|вітаю)[,!]?\s*)?(?:(?:хочу(?:\s+(?:замовити|подарувати))?|замовте|створіть|подарувати)\s+)?(?:(?:пісню|пісня)\s*)?(?:для(?:\s+(?:моєї|нашої|своєї|мого|нашого|свого))?)?$/iu.test(clausePrefix);
      if(!standalone&&(!clausePrefix||!direct))return false;
     }

     if(!standalone&&!/(?:^|\s)(?:для(?:\s+(?:моєї|нашої|своєї|мого|нашого|свого))?|пісню|пісня|хочу|подарувати)$/iu.test(prefix))return false;
     if(/(?:^|\s)від$/iu.test(prefix))return false;
     return !/^кохан(?:ого|ої)$/iu.test(match[1])||/(?:^|\s)для$/iu.test(prefix);
    });
    const relation=recipientMatch?.[1];
    const recipientName=recipientMatch?message.slice(recipientMatch.index!+recipientMatch[0].length).match(/^\s+([А-ЯІЇЄҐ][а-яіїєґ’'ʼ-]+)(?=$|[\s,!.])/u)?.[1]:undefined;
    if(relation&&(order.recipient==='Не вказано'||provisional('recipient'))){order.recipient=relation;remember('recipient',relation);markChanged();}
    if(recipientName&&!state.answers.sender)details.sender=recipientName;
    const narrator=message.match(/(?:від мого імені|від мене|від (?:дружини|чоловіка|дітей|доньки|сина|родини|коханого|коханої))(?=$|[\s,.!])/iu)?.[0];
    if(narrator){state.answers.narrator=narrator;remember('narrator',narrator);markChanged();}
    if((tone==='memory'||tone==='distance')&&!details.occasion&&!state.answers.occasion){details.occasion=tone==='memory'?'Пісня пам’яті':'Пісня підтримки';remember('occasion',details.occasion,'inferred');}
    let captured=false;
    for(const [key,value] of Object.entries(details)){
     if(!value||(state.answers[key]===value&&!provisional(key)))continue;
     if(state.answers[key]&&!provisional(key)&&!['story','sound','avoid'].includes(key))continue;
     const saved=key==='story'&&state.answers.story?state.answers.story+'\n'+value:value;
     if(key!=='avoid')state.answers[key]=saved;captured=true;
     if(!(key==='occasion'&&state.facts?.occasion?.source_message_id===state.messages.length-1&&state.facts.occasion.value===value))remember(key,value);
     if(key==='occasion')order.occasion=saved;
     if(key==='eventDate')order.eventDate=saved;
     if(key==='story')order.story=saved;
    }
    const topic=/^(?:дітей|діти|про дітей|про сім[’'ʼ]ю|сім[’'ʼ]я)[.!\s]*$/iu.test(message)?'діти':/^(?:\d+\s+років|любов|вдячність|підтримка)[.!\s]*$/iu.test(message)?message:undefined;
    if(topic){state.topic=topic;remember('topic',message);markChanged();}
    else if(/^(?:хочу|обираю|погоджуюся на) (?:більш )?універсальн\S* (?:пісню|варіант)[.!]?$/iu.test(message)){state.universal=true;markChanged();}
    else if(originalCount>1&&!captured&&!relation&&!narrator&&!Object.values(details).some(Boolean)&&field&&(field==='recipient'?order.recipient==='Не вказано'||provisional(field):!state.answers[field]||provisional(field)||['story','sound','avoid'].includes(field))&&message.length>=2&&supportedFactUpdate({field,value:message,evidence:message,correction:false},message,askedField)&&(field!=='story'||(message.trim().split(/\s+/u).length>=3&&!/^(?:щось гарне|не знаю|не пам[’'ʼ]ятаю)[.!]?$/iu.test(message)))){
     if(field==='recipient'){order.recipient=message;remember('recipient',message);}
     else if(field==='story'){
      state.answers.story=[state.answers.story,message].filter(Boolean).join('\n');order.story=state.answers.story;remember('story',message);
     }else{
      if(field!=='avoid')state.answers[field]=message;remember(field,message);
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
 return conversationView(id,state,order);
})()}

function conversationView(id:string,state:State,order:Order){
 const link=telegramLink(id);
 return {deliveryRevision:load(id).order.revision,contactPaused:!!order.contactPaused,pauseAcknowledgementIndex:state.pauseAcknowledgementIndex,telegramUrl:'https://t.me/podaruy_pisnyu_bot?start='+link.code,messages:state.messages,mode:state.mode,handoffReason:state.handoffReason,storyReadiness:readiness(state,order),canConfirm:state.mode==='assistant'&&state.reviewed===true&&readiness(state,order)==='ready_for_review',confirmed:readiness(state,order)==='confirmed',paymentLink:state.mode==='assistant'&&readiness(state,order)==='confirmed'?order.paymentLink:''};
}
export function dialogueSnapshot(id:string){id=activeOrderId(id);const {state,order}=load(id);return {...conversationView(id,state,order),orderId:id};}

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

// One successor per completed order; creation and the first turn share a transaction.
function repeatTables(){
 db().exec(`CREATE TABLE IF NOT EXISTS repeat_orders(previousId TEXT PRIMARY KEY,nextId TEXT UNIQUE NOT NULL,opening TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_ordering(orderId TEXT PRIMARY KEY,issued INTEGER NOT NULL,applied INTEGER NOT NULL,storedRevision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS conversation_reservations(orderId TEXT NOT NULL,requestId TEXT NOT NULL,input TEXT NOT NULL,sequence INTEGER NOT NULL,appliedAtStart INTEGER NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(orderId,requestId));
 CREATE TABLE IF NOT EXISTS conversation_requests(orderId TEXT NOT NULL,requestId TEXT NOT NULL,input TEXT NOT NULL,response TEXT NOT NULL,PRIMARY KEY(orderId,requestId));`);
}
type TurnOrder={revision:number;sequence:number;appliedAtStart:number};
function reserveTurn(id:string,input:string,revision:number,requestId?:string){
 db().prepare('INSERT OR IGNORE INTO conversation_ordering VALUES(?,0,0,?)').run(id,revision);
 const previous=requestId?db().prepare('SELECT input,sequence,appliedAtStart,revision FROM conversation_reservations WHERE orderId=? AND requestId=?').get(id,requestId) as {input:string;sequence:number;appliedAtStart:number;revision:number}|undefined:undefined;
 if(previous){if(previous.input!==input)throw Error('REQUEST_REUSED');return previous;}
 const completed=requestId?db().prepare('SELECT input FROM conversation_requests WHERE orderId=? AND requestId=?').get(id,requestId) as {input:string}|undefined:undefined;
 if(completed&&completed.input!==input)throw Error('REQUEST_REUSED');
 const row=db().prepare('SELECT issued,applied FROM conversation_ordering WHERE orderId=?').get(id) as {issued:number;applied:number};
 const reservation={sequence:row.issued+1,appliedAtStart:row.applied,revision};
 db().prepare('UPDATE conversation_ordering SET issued=? WHERE orderId=?').run(reservation.sequence,id);
 if(requestId)db().prepare('INSERT INTO conversation_reservations VALUES(?,?,?,?,?,?)').run(id,requestId,input,reservation.sequence,reservation.appliedAtStart,revision);
 return reservation;
}
export function beginDialogueTurn(id:string,revision:number,message?:string,confirm=false,requestId?:string):TurnOrder{
 return db().transaction(()=>{repeatTables();return reserveTurn(id,JSON.stringify({message,confirm}),revision,requestId)})();
}
export function activeOrderId(id:string){
 repeatTables();
 const seen=new Set<string>();
 while(!seen.has(id)){
  seen.add(id);
  const link=db().prepare('SELECT nextId FROM repeat_orders WHERE previousId=?').get(id) as {nextId:string}|undefined;
  if(!link)return id;
  id=link.nextId;
 }
 throw Error('ORDER_CHAIN_CYCLE');
}
function repeatIntent(message:string){
 const text=message.trim();
 const purchase=/(?:нове замовлення|нову пісню|ще одну пісню|іншу пісню)/iu.test(text)||(/замовити|замовляю/iu.test(text)&&/пісню/iu.test(text));
 const uncertain=/\?|можливо|мабуть|думаю|не (?:хочу|потрібно|замовля)|не нов|не ще/iu.test(text);
 const explicit=/^(?:(?:дякую|вітаю|привіт)[,.!]?\s+)?(?:я\s+)?(?:хочу|хотіла б|хотів би|замовляю|потрібна|потрібно|давайте|оформіть|створіть)/iu.test(text);
 const newSong=/(?:нову|ще одну|іншу)\s+пісню|нове замовлення/iu.test(text);
 if(purchase&&newSong&&explicit&&!uncertain&&!/правк|версі[юяї]/iu.test(text))return 'new';
 if((purchase&&!/правк|версі[юяї]/iu.test(text))||/ще одну|ще пісню|ще замовлення/iu.test(text))return 'clarify';
 return 'followup';
}
export function conversation(id:string,message?:string,confirm=false,interpreted?:{revision:number;proposal:Interpretation},requestId?:string,expected?:TurnOrder){
 return db().transaction(()=>{
  repeatTables();
  const input=JSON.stringify({message,confirm});
  const cached=requestId?db().prepare('SELECT input,response FROM conversation_requests WHERE orderId=? AND requestId=?').get(id,requestId) as {input:string;response:string}|undefined:undefined;
  if(cached){
   if(cached.input!==input)throw Error('REQUEST_REUSED');
   const response=JSON.parse(cached.response) as ReturnType<typeof conversationTurn>&{orderId:string};
   // A cached assistant response never resumes a conversation locked meanwhile.
   if(load(response.orderId).state.mode==='producer')return {...conversationTurn(response.orderId),orderId:response.orderId};
   return response;
  }
  const original=load(id);
  const arrival=expected||(message||original.state.messages.length===1&&original.order.opening?reserveTurn(id,input,original.order.revision,requestId):undefined);
  const ordering=db().prepare('SELECT applied,storedRevision FROM conversation_ordering WHERE orderId=?').get(id) as {applied:number;storedRevision:number}|undefined;
  const applied=ordering?.applied||0;
  // Compare arrival order before deterministic corrections or successor routing.
  // External revision changes also invalidate intent. A log-only stale append
  // updates storedRevision without advancing applied, so it cannot cancel a newer turn.
  const stale=arrival&&(!!expected&&activeOrderId(id)!==id||arrival.sequence<applied||original.order.revision!==arrival.revision&&original.order.revision!==ordering?.storedRevision);
  if(stale){
   const result={...conversationTurn(id,message,false,undefined,true),orderId:id,stale:true as const};
   db().prepare('UPDATE conversation_ordering SET storedRevision=? WHERE orderId=?').run(load(id).order.revision,id);
   if(requestId)db().prepare('INSERT INTO conversation_requests VALUES(?,?,?,?)').run(id,requestId,input,JSON.stringify(result));
   return result;
  }
  // A newer arrival may follow an older completed turn, but its model proposal
  // was based on old state: only the synchronous input interpretation is valid.
  if(expected&&original.order.revision!==expected.revision)interpreted=undefined;
  const originalId=id;
  const prior=db().prepare('SELECT opening FROM repeat_orders WHERE previousId=?').get(id) as {opening:string}|undefined;
  id=activeOrderId(id);
  if(id!==originalId){confirm=false;interpreted=undefined;}
  // Legacy callers without a request ID can retry the transition through the old ID.
  if(prior&&message===prior.opening)message=undefined;
  const {order,state}=load(id);
  if(message&&(escalationReason(message)||requestsNoContact(message))){
   state.repeatPending=undefined;
   db().prepare('INSERT OR REPLACE INTO conversations VALUES(?,?)').run(id,JSON.stringify(state));
  }
  if(order.status==='Завершено'&&message&&state.mode!=='producer'&&!escalationReason(message)&&!requestsNoContact(message)){
   const intent=repeatIntent(message);
   const accepts=!!state.repeatPending&&/^(?:так,? нове замовлення|нове замовлення)[.!\s]*$/iu.test(message);
   if(intent==='new'||accepts){
    const opening=accepts?state.repeatPending+'\n'+message:message;
    const nextId=createOrder({name:order.name,contact:order.contact,channel:order.channel,recipient:'Не вказано',requestId:randomUUID()},order.source);
    const row=db().prepare('SELECT body FROM orders WHERE id=?').get(nextId) as {body:string};
    db().prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify({...JSON.parse(row.body),opening,previousOrderId:id}),nextId);
    db().prepare('INSERT INTO repeat_orders VALUES(?,?,?)').run(id,nextId,message);
    // Keep the original conversation and financial records unchanged.
    id=nextId;message=undefined;interpreted=undefined;confirm=false;
   }else if(intent==='clarify'||state.repeatPending){
    const declining=/^(?:ні|ні,|це стар|щодо стар|продовж)/iu.test(message);
    state.repeatPending=declining?undefined:state.repeatPending||message;
    state.messages.push({role:'user',text:message},{role:'assistant',text:declining?'Зрозуміла, продовжуємо щодо попереднього замовлення.':'Це нове замовлення окремої пісні чи продовження попереднього? Для нового напишіть «Так, нове замовлення».'});
    save(id,state,order,true);message=undefined;confirm=false;
   }
  }
  const result={...conversationTurn(id,message,confirm,interpreted),orderId:id};
  if(arrival)db().prepare('UPDATE conversation_ordering SET applied=MAX(applied,?),storedRevision=? WHERE orderId=?').run(arrival.sequence,load(originalId).order.revision,originalId);
  if(requestId)db().prepare('INSERT INTO conversation_requests VALUES(?,?,?,?)').run(originalId,requestId,input,JSON.stringify(result));
  return result;
 })();
}

// Delivery-time guard, also resolves already-linked predecessor IDs.
export function contactPause(id:string){const {order,state}=load(activeOrderId(id));return {paused:!!order.contactPaused,acknowledgementIndex:state.pauseAcknowledgementIndex};}
