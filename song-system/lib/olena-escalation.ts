// Local safety routing, independent of the model's proposed action. Negations
// suppress only the human-request phrase, never a separate complaint/payment.
const human = '(?:продюсер\\S*|менеджер\\S*|оператор\\S*|фахів\\S*|людин[ауі])';
const refusedHuman = new RegExp(`(?:${human}\\s+не\\s+потріб\\S*|не\\s+(?:потріб\\S*|кличте|викликайте|запрошуйте|треба\\s+(?:кликати|запрошувати))\\s+${human}|не\\s+хочу\\s+(?:(?:говорити|поговорити|спілкуватися)\\s+з\\s+)?${human})`, 'giu');
function withoutNarrativeQuotes(message:string){
 return message.replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,(quote,offset:number)=>{
  const introduction=message.slice(0,offset).split(/[.!?]/u).at(-1)||'';
  return /сказа|жартува|розповіда|цитат|для історії|нашій історії/iu.test(introduction)?' ':quote;
 });
}
const refusedRefund=/(?<![\p{L}])не\s+(?:хочу|прошу|потрібно|потрібне)\s+повернен\S*\s+(?:(?:моїх|наших)\s+)?(?:кошт\S*|грош\S*)/giu;
function withoutRefusal(message:string){return message.replace(refusedHuman,' ').replace(refusedRefund,' ');}
export function declinesHandoff(message:string){return withoutRefusal(message)!==message;}
export const dialogueGreeting=/^(?:привіт(?:ик)?|вітаю|добрий день|доброго дня|добрий вечір|доброго вечора|добрий ранок|доброго ранку|👋)(?=$|[\s,.!🤍😊👋])(?:[\s,.!🤍😊👋]*)/iu;
// Explicit present order intent only, not questions, quotes or unrelated cancellation.
export function requestsOrderCancellation(message:string){
 const text=message.trim().replace(dialogueGreeting,'');
 if(/^(?:я\s+)?не\s+(?:буду|хочу)\s+замовляти(?:\s+пісню)?\s*(?:[.!](?=\s|$)|$)/iu.test(text))return true;
 return /^(?:(?:будь ласка|дякую)[,!]?\s+)?(?:скасуйте\s+(?:(?:моє|наше|це)\s+)?замовлення|(?:я\s+)?відмовляю(?:ся|сь)\s+від\s+(?:(?:мого|свого|нашого|цього)\s+)?замовлення)(?:[, ]+будь ласка)?\s*(?:[.!](?=\s|$)|$)/iu.test(text);
}
// Present, anchored service request only; quoted history and negation are not requests.
export function requestsPersonalDemo(message:string){
 const text=message.trim().replace(dialogueGreeting,'');
 return /^(?:будь ласка[,!]?\s+)?(?:зробіть|створіть|підготуйте)\s+персональн(?:е\s+демо|ий\s+демозапис)(?:\s+(?:моєї|нашої)\s+пісні)?(?:[, ]+будь ласка)?\s*(?:[.!](?=\s|$)|$)/iu.test(text);
}
export function escalationReason(message:string){
 if(requestsOrderCancellation(message))return 'Запит на скасування замовлення: '+message.slice(0,300);
 const text=withoutRefusal(withoutNarrativeQuotes(message))
  .replace(/(?<![\p{L}])не\s+(?:(?:вже|ще)\s+)?(?:оплатив|оплатила|сплатив|сплатила|переказав|переказала|перерахував|перерахувала)/giu,' ')
  .replace(/(?<![\p{L}])не\s+розчар\S*|не\s+маю\s+скарг/giu,' ');
 const requestsHuman=new RegExp(`(?:хочу|прошу|потріб|поклич|переда|з[’'ʼ]єдн|поговор|спілку|запрос|допомо|зв[’'ʼ]яз)[^.!?]*${human}|${human}[^.!?]*(?:потріб|допомо|зв[’'ʼ]яж)|^\\s*${human}(?:[, ]+будь ласка)?[.!\\s]*$`,'iu').test(text);
 if(requestsHuman||/поверн.*(?:кошт|грош)|refund/iu.test(text)
  ||/(?:передайте|покличте|прошу|з[’'ʼ]єднайте|поговорити|поспілкуватися|зв[’'ʼ]язатися)[^.!?]*(?:жив\S*\s+фахів|фахів|команд)/iu.test(text)
  ||/(?:хтось|хочу|нехай)[^.!?]*команд[^.!?]*(?:допомо|розібра|особист|обговор)|хочу\s+обговорити[^.!?]*команд/iu.test(text))return 'Клієнт просить особисте вирішення: '+message.slice(0,300);
 if(/не сподобал|незадоволен|скарг/iu.test(text)
  ||/(?:результат|пісня|піснею)[^.!?]*розчар|(?:я|мене)\s+розчар/iu.test(text))return 'Скарга на результат: '+message.slice(0,300);
 if(/(?:я\s+)?(?:вже\s+)?(?:оплатив|оплатила|сплатив|сплатила)|квитанці/iu.test(text)
  ||/(?:грош|кошти|платіж)[^.!?]*(?:переказ|перерахув|відправ)|(?:переказ|перерахув)[^.!?]*(?:грош|кошти|платіж)|перевір(?:те|ити)[^.!?]*(?:надходжен|платіж|оплат)/iu.test(text))return 'Перевірити надходження оплати. Клієнт повідомив про платіж.';
 if(requestsPersonalDemo(message))return 'Запит персонального демо: у форматі 2.0 такої послуги немає. Уточнення передано продюсеру.';
}

// Explicit written-contact refusal; phone-only and song-content preferences are separate.
export function requestsNoContact(message:string){
 const text=message.trim().replace(dialogueGreeting,'');
 return /^(?:будь ласка[,!]?\s+)?(?:(?:більше\s+)?не пишіть(?:\s+мені)?(?:\s+більше)?|не надсилайте\s+мені\s+повідомлен(?:ь|ня)|відпишіть\s+мене|не зв[’'ʼ]язуйтеся\s+зі?\s+мною)(?:[, ]+будь ласка)?\s*(?:[.!](?=\s|$)|$)/iu.test(text);
}
