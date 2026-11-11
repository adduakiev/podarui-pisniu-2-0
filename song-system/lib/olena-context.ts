// Conservative local interpretation based on the brand's conversation guide.
// Only explicit details are extracted; the original message stays in history.
export type Tone='memory'|'distance'|'joy'|'neutral';
export function toneOf(text:string):Tone{
 if(/(?:на|у) пам[’'ʼ]ять|пісн\S* пам[’'ʼ]яті|(?:якого|якої) не стало|помер|покійн|загинув|загинула|втратил/iu.test(text))return 'memory';
 const distantPerson=/(?:чоловік|дружина|мама|тато|син|донька|коханий|кохана)\s+(?:(?:зараз|нині|живе|перебуває)\s+)?далеко(?!\s+не(?:\s|$))(?=$|[\s,.!])/iu.test(text);
 const support=text.replace(/(?<![\p{L}])не\s+хочу\s+підтримати/giu,'');
 if(distantPerson&&/(?:хочу|хочемо)\s+підтримати|сумую\s+за/iu.test(support))return 'distance';
 if(/захища[єю].*україн|військов|служить|службі|на відстані|розлук/iu.test(text))return 'distance';
 if(/пробач|вибач|перепрос/iu.test(text))return 'neutral';
 return /річниц|весіл|народжен|ювіл/iu.test(text)?'joy':'neutral';
}
export function explicitDetails(text:string){
 const parts=text.split(/[,;\n]/u).map(part=>part.trim());
 const positiveText=text.replace(/(?:^|[.!?]\s*)не\s+(?:на|до)\s+[^.!?]+[.!?]?/giu,' ');
 const occasion=/(?:просто подякувати|без приводу|просто так)/iu.test(positiveText)?'Подяка без приводу':positiveText.match(/(?:на |до )?(?:річниц[юі]|день народження|дня народження|весілля|ювілей)(?: весілля)?/iu)?.[0];
 const eventDate=text.match(/(?:^|(?:до|потрібно|подарунок на)\s+)(\d{1,2}\s+(?:січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)(?:\s+20\d{2})?)(?=$|[\s,.;!?])/iu)?.[1];
 const soundParts=parts.filter(part=>/^(?:(?:хочу|бажано|можна)\s+)?(?:зворушлив|ніжн|романтичн|весел|сумн|тепл)\S*\s+настрій|^(?:але\s+)?(?:не\s+)?(?:(?:надто|дуже)\s+)?(?:повільн|швидк|помірн|жвав)\S*\s+темп|^(?:але\s+)?(?:зворушливо|(?:не\s+)?(?:(?:надто|дуже)\s+)?(?:повільно|швидко))[.!]?$/iu.test(part)||/^(?:(?:хочу|бажано|можна)\s+)?(?:(?:жіноч|чоловіч)\S*\s+голос\S*|дует|(?:ніжн\S*|романтичн\S*|весел\S*)\s+(?:балад\S*|пісн\S*)|романтичне|ніжно|весело)(?=$|[\s.!])/iu.test(part)||/^(?:(?:хочу|бажано|можна)\s+)?(?:(?:ніжн|романтичн|весел|спокійн|легк|енергійн)\S*\s+)?(?:поп|рок|джаз)(?=$|[\s.!])/iu.test(part));
 const sound=soundParts.length?soundParts.join(', '):undefined;
 const avoid=text.match(/(?:^|[,;]\s*)не називайте\s+(?:(?:її|його|мене)\s+)?([^,;.!]+)/iu)?.[1]||text.match(/(?:^|[,;]\s*)(?:не згадуйте|не згадувати|без згадки про)\s+([^,;.!]+)/iu)?.[1];
 const sender=text.match(/(?:її|його|дружину|чоловіка|маму|тата)\s+звати\s+([\p{L}’'ʼ-]+)/iu)?.[1];
 const story=/(?:познайомил|закохал|живемо разом|маємо (?:сина|доньку|дітей)|хочу сказати|хочу подякувати|пам[’'ʼ]ятаю)/iu.test(text)?text:undefined;
 return {occasion,eventDate,sound,avoid,sender,story};
}
export function reaction(tone:Tone){
 switch(tone){
  case 'memory':return 'Мені шкода Вашої втрати. Дякую, що довірили нам цю історію.';
  case 'distance':return 'Дякую, що поділилися. Допоможемо передати в пісні те, що важливо сказати на відстані.';
  case 'joy':return 'Яка гарна нагода подарувати пісню зі своєю історією!';
  default:return '';
 }
}

export function storySignals(text:string){
 const anchors=[
  /познайомил|перша зустріч|вперше зустріли/iu,
  /маємо (?:сина|доньку|дітей)|народил[аои].*(?:син|доньк|дитин)|(?:наш|наша) (?:син|донька)/iu,
  /подорож|поїхал|відвідал|прогулянк/iu,
  /щоранку|щовечора|щонеділі|завжди (?:готу|пече|чека|зустріча)/iu,
  /(?:разом|одружені)\s+\d+\s+(?:рок|рік)|\d+\s+років\s+разом/iu,
  /переїхал|жили в|пережил|підтримав|підтримала|навчив|навчила/iu,
  /(?:каже|казав|казала|називає)\s+[«"„]/iu
 ].filter(pattern=>pattern.test(text)).length;
 return {anchors,emotion:/люблю|кохаю|закохал|вдячн|подякува|підтримати|пишаю|сумую|бракує|пробач|ціную|бережу/iu.test(text)};
}

// Apply a literal relationship-duration correction to that fact only. Never
// replace the family story with a short model summary or touch a child's age.
export function correctedRelationshipStory(message:string,story:string){
 const change=message.match(/^(?:виправлю|уточню|виправлення)\s*[:—-]\s*(?:ми\s+)?разом\s+(\d+)\s+(років|роки|рік)\s*,?\s*а\s+не\s+(\d+)(?:\s+(?:років|роки|рік))?[.!]?$/iu);
 if(!change||change[1]===change[3])return undefined;
 const old=new RegExp(`(^|[^\\p{L}])((?:ми\\s+)?разом\\s+)${change[3]}\\s+(?:років|роки|рік)(?=$|[^\\p{L}])`,'giu');
 const candidates=Array.from(story.matchAll(old)).filter(match=>{
  if(/^ми\s/iu.test(match[2]))return true;
  // A standalone sentence in the first-person story can omit «ми». A
  // relationship attributed to parents/another subject cannot be changed.
  const preceding=story.slice(0,match.index).split(/[.!?\n]/u).at(-1)?.trim();
  return !preceding;
 });
 if(candidates.length!==1)return null;
 const match=candidates[0]!;
 return story.slice(0,match.index)+match[1]+match[2]+change[1]+' '+change[2]+story.slice(match.index!+match[0].length);

}
