import { z } from 'zod';
export const sourcePages=['/pisnia-dlia-mamy','/pisnia-na-den-narodzhennia'] as const;
export type SourcePage=typeof sourcePages[number];
export const landingDefaults:Record<SourcePage,{recipient?:string;occasion?:string}>={
 '/pisnia-dlia-mamy':{recipient:'мама'},
 '/pisnia-na-den-narodzhennia':{occasion:'День народження'},
};
export const plans={story:200000,own:100000,military:100000} as const;
export const labels={story:'Пісня за вашою історією',own:'Пісня за власним текстом',military:'Для військових та їхніх родин'};
export const states=['Нове звернення','Збір інформації','Текст','Музика','Перевірка','Передано','Завершено','Відкладено'] as const;
export const orderSchema=z.object({source_page:z.enum(sourcePages).optional(),opening:z.string().trim().min(1).max(6000).optional(),name:z.string().trim().min(2).max(100),contact:z.string().trim().min(5).max(200),channel:z.enum(['Telegram','WhatsApp','Instagram','Телефон','Email']).default('Telegram'),recipient:z.string().trim().min(2).max(100),occasion:z.string().trim().max(100).default(''),eventDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''),plan:z.enum(['story','own','military']).default('story'),story:z.string().trim().max(15000).default(''),requestId:z.string().uuid(),website:z.string().max(0).optional()});
export const updateSchema=z.object({id:z.string().uuid(),revision:z.number().int().min(0),status:z.enum(states),notes:z.string().max(15000),nextAction:z.string().max(1000),completeBrief:z.boolean(),paymentDetailsShared:z.boolean().optional(),followupOptOut:z.boolean().optional(),followupDoubt:z.boolean().optional(),followupSent:z.boolean().optional(),payment:z.object({amount:z.number().int().positive().max(10000000),note:z.string().max(200)}).optional(),paymentLink:z.string().url().max(2000).or(z.literal('')).refine(v=>!v||v.startsWith('https://'))});
export function deadline(start:string){return new Date(new Date(start).getTime()+48*60*60*1000).toISOString()}
export type Order={contactPaused?:boolean;previousOrderId?:string;source_page?:SourcePage;landing_defaults?:{recipient?:string;occasion?:string};lastInboundAt?:string;followupOptOut?:boolean;followupDoubtAt?:string;followupSentAt?:string;source?:'site'|'instagram'|'telegram';paymentDetailsSharedAt?:string;opening?:string;communicationMode?:'assistant'|'producer';handoffReason?:string;id:string;name:string;contact:string;channel:string;recipient:string;occasion:string;eventDate:string;plan:keyof typeof plans;story:string;createdAt:string;status:typeof states[number];notes:string;nextAction:string;briefAt:string|null;dueAt:string|null;revision:number;paymentLink:string;amount:number;paid:number};
export type Media={id:string;kind:'song'|'review';title:string;description:string;filename:string;mime:string;slot?:string;published:boolean;consent:boolean;position:number;createdAt:string};

export const crmSegments=[
 ['intake','На прийманні'],
 ['followup','Можна повернутися'],
 ['paymentShared','Реквізити надіслано'],
 ['partial','Частково оплачено'],
 ['paid','Повністю оплачено'],
 ['fulfilled','Передано клієнту'],
] as const;

export type CrmSegment=typeof crmSegments[number][0];

export function matchesCrmSegment(order:Order,segment:CrmSegment){
 const intake=order.status==='Нове звернення'||order.status==='Збір інформації';
 switch(segment){
  case 'intake':return intake;
  case 'followup':return !!followupDraft(order);
  case 'paymentShared':return !!order.paymentDetailsSharedAt;
  case 'partial':return order.paid>0&&order.paid<order.amount;
  case 'paid':return order.paid>=order.amount;
  case 'fulfilled':return order.status==='Передано'||order.status==='Завершено';
 }
}


export function followupDraft(order:Order,now=Date.now()){
 if(order.contactPaused||order.followupOptOut||order.paid>0||!order.contact.trim()||order.contact==='Чат сайту')return;
 if(!['Нове звернення','Збір інформації','Відкладено'].includes(order.status))return;
 const inbound=Date.parse(order.lastInboundAt||order.createdAt);
 const sent=Date.parse(order.followupSentAt||'')||0;
 const shared=Date.parse(order.paymentDetailsSharedAt||'')||0;
 const doubt=Date.parse(order.followupDoubtAt||'')||0;
 const silence=24*60*60*1000;

 if(shared){
  if(shared<=sent||inbound>shared||now-shared<silence)return;
  return 'Вітаю! Чи все зрозуміло з реквізитами? Якщо залишилися питання щодо замовлення або оплати, я підкажу.';
 }
 if(doubt>=inbound&&doubt>sent&&doubt<=now)return 'Вітаю! Якщо ще вагаєтеся, можу коротко пояснити, як створюємо пісню, і допомогти з форматом.';
 if(order.briefAt||inbound<=sent||now-inbound<silence)return;
 return 'Вітаю! Якщо пісня ще актуальна, можемо продовжити з того, на чому зупинилися. Я допоможу зібрати історію.';
}
