import type {Interpretation} from './olena-interpreter';
import {offeredContacts} from './crm-records';
import {explicitDetails} from './olena-context';

type Update = Interpretation['updates'][number];
const normalize = (text:string) => text.normalize('NFKC').toLocaleLowerCase('uk').replace(/[’ʼ]/gu,"'").replace(/\s+/gu,' ').trim();
// Explicitly supported Ukrainian relation inflections, not general stemming:
// arbitrary shared word fragments must never establish a fact.
const relations = [
 ['мама','мамі','мами','маму','матуся','матусі','матусю'],
 ['бабуся','бабусі','бабусю'],['сестра','сестрі','сестри','сестру'],
 ['тато','тату','тата','батько','батькові'],['дружина','дружині','дружини','дружину'],
 ['чоловік','чоловіку','чоловікові','чоловіка'],['донька','доньці','доньки','доньку'],
 ['син','сину','синові','сина'],['кохана','коханій','коханої','кохану'],['коханий','коханому','коханого'],
];
function tokens(text:string){return normalize(text).match(/[\p{L}\d'-]+/gu)||[];}
function canonical(text:string){return tokens(text).map(word=>relations.find(group=>group.includes(word))?.[0]||word).join(' ');}
function containsValue(evidence:string,value:string,field:Update['field']){
 const source=field==='recipient'?canonical(evidence):tokens(evidence).join(' ');
 const target=field==='recipient'?canonical(value):tokens(value).join(' ');
 return !!target&&(` ${source} `).includes(` ${target} `);
}

export function supportedFactUpdate(update:Update,message:string,askedField?:string){
 if(!message.includes(update.evidence))return false;
 const {field,value,evidence}=update;
 const details=explicitDetails(message);
 const normalizedDetail=field in details?details[field as keyof typeof details]:undefined;
 if(!containsValue(evidence,value,field)&&!(normalizedDetail&&normalize(normalizedDetail)===normalize(value)&&field==='occasion'&&explicitDetails(evidence).occasion===normalizedDetail))return false;
 const text=normalize(message);
 if(['sender','recipient'].includes(field)&&/^(?:так|ні|можливо|мабуть|не знаю|не пам[’'ʼ]ятаю|не впевнен[аи]|важко сказати|добре|гаразд|ок|неважливо)[.!?\s]*$/u.test(text))return false;
 const correctionCue=/^(?:ні[,!]?\s+|не\s+.+?[,]?\s+а\s+|тепер\s+(?:отримувач|ім'я|привід|дата|історія|голос|настрій)|(?:змінити|змініть|заміни|виправити|виправте)\s+)/u.test(text);
 // The model's correction bit is not authorization to replace a known fact.
 if(update.correction&&!correctionCue)return false;
 if(field==='sender'){
  const named=message.match(/(?:її|його|дружину|чоловіка|маму|тата|отримувачку|отримувача)\s+(?:звати|[—:-])\s+([\p{L}’'ʼ-]+)/iu)?.[1];
  if(named&&normalize(named)===normalize(value))return true;
  if(/(?:мене|меня)\s+звати|моє\s+ім['’]я/u.test(text))return false;
  if(askedField==='sender'&&tokens(message).length===1)return true;
  // A standalone proper name immediately after an explicit recipient, as in
  // «Хочу для Матусі. Галина.», has a supported recipient role.
  const segments=message.split(/[.!]/u).map(part=>part.trim()).filter(Boolean);
  const valueIndex=segments.findIndex(part=>normalize(part)===normalize(value));
  const recipientBefore=valueIndex>0&&/(?:для\s+|^)(?:матусі|матуся|мами|мама|мамі|бабусі|дружині|чоловікові)(?=$|[\s,.!])/iu.test(segments[valueIndex-1]);
  const adjoining=/^(?:матуся|мама|мамі|матусі|бабусі)\s+([\p{L}’'ʼ-]+)[.!]?$/iu.exec(message)?.[1];
  return !!recipientBefore||!!adjoining&&normalize(adjoining)===normalize(value);
 }
 if(field==='recipient'){
  // A question supplies context, not proof that every person mentioned is
  // the recipient. Accept a literal noun answer, optionally possessive.
  const briefAnswer=text.replace(/^(?:моїй|моєму|нашій|нашому|своїй|своєму|моєї|нашої|своєї)\s+/u,'').replace(/[.!]+$/u,'');
  if(askedField==='recipient'&&tokens(briefAnswer).length===1&&canonical(briefAnswer)===canonical(value))return true;
  // Check the positive recipient clause, not merely an occurrence anywhere
  // in the message (the value may be negated or belong to another person).
  // A contact-only line is independent of the recipient clause. Remove only
  // wholly structured contact lines, then normalize together so a negation
  // split across lines still applies. Mixed prose/contact lines stay intact.
  const recipientText=normalize(message.split(/\r?\n/u).filter(line=>!line.split(/[;,]/u).every(part=>offeredContacts(part).length>0)).join(' '));
  const clauses=recipientText.split(/[,;.!]/u).map(part=>part.trim());
  return clauses.some(clause=>{
   if(/(?:^|\s)не\s+(?:для|пісня)/u.test(clause))return false;
   const target=clause.match(/(?:^|\s)(?:для(?:\s+(?:моєї|нашої|своєї|мого|нашого|свого))?|подарувати|подякувати|отримувач\s*[—:-]?)\s+([\p{L}' -]+)/u)?.[1]
    ||(update.correction&&correctionCue?clause.match(/^а\s+([\p{L}' -]+)$/u)?.[1]:undefined)
    ||(tokens(clause).length<=2&&relations.some(group=>group.includes(tokens(clause)[0]||''))?clause:undefined);
   return !!target&&canonical(target)===canonical(value);
  });
 }
 if(field==='narrator'){
  const narrator=message.match(/(?:^|\s)(від\s+[^,.!;]+)/iu)?.[1];
  return !!narrator&&containsValue(narrator,value,field)||askedField==='narrator';
 }
 // Other fields require a literal value (or the local occasion normalization),
 // plus an explicit field cue or an answer to the question actually asked.
 if(field==='occasion'||field==='eventDate'||field==='sound'||field==='avoid')return !!normalizedDetail&&(normalize(normalizedDetail)===normalize(value)||containsValue(normalizedDetail,value,field))||askedField===field||update.correction&&correctionCue;
 return true; // Literal story excerpt; arbitrary invented summaries were rejected above.
}
