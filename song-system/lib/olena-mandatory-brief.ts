export type MandatoryInstruction={text:string;source_message_id:number|null;source?:'form'|'message';source_field?:'story';source_page?:string;kind:'instruction'|'amendment'};
// Preserve direct instructions verbatim; do not infer a normalized list of facts.
export function mandatoryInstructionKind(message:string,hasInstructions=false):MandatoryInstruction['kind']|undefined{
 const text=message.trim();
 if(hasInstructions&&/^не згадуйте\s+[\p{L}«][^.!?]+(?:[.!]|$)/iu.test(text))return 'amendment';
 if(text.includes('?'))return;
 // Direct restriction/demotion only; retain exact words rather than guessing the item.
 if(/^приберіть\s+[\p{L}«][^.!?:]+?\s+з обов[’'ʼ]язкових (?:деталей|побажань)(?:[.!]|$)/iu.test(text))return 'amendment';
 if(!/^(?:я|він|вона|вони|ми|ви)\s/iu.test(text)&&!/(?:^|\s)(?:сказ\p{L}*|каж\p{L}*|каз\p{L}*|вважа\p{L}*|дума\p{L}*|можливо|мабуть|нібито|начебто|напевно)(?=\s)/iu.test(text.split(/[.!]/u)[0])&&/^[\p{L}’'ʼ-]+(?:\s+[\p{L}’'ʼ-]+){0,3}\s+більше не обов[’'ʼ]язков(?:ий|а|е|і)(?:[.!]|$)/iu.test(text))return 'amendment';
 if(/^уточню\s+обов[’'ʼ]язкові\s+(?:деталі|побажання)\s*:\s*\S/iu.test(text))return 'amendment';
 if(/^обов[’'ʼ]язково\s+(?:залиште|згадайте|згадати|додайте|включіть|передайте)\s+\S/iu.test(text))return 'instruction';
}
export function mandatoryBrief(entries:MandatoryInstruction[]):string{
 return 'Дослівні інструкції клієнта, не автоматично узгоджений перелік фактів. Найновіше уточнення має перевагу над суперечливим попереднім; решта попередніх побажань зберігається. Фон і необов’язкові деталі не стають обов’язковими. Неясні посилання має уточнити продюсер.\n'+[...entries].reverse().map((entry,index)=>`${index===0?'Найновіший запис':'Попередній запис — лише в частині, не зміненій новішими'} (${entry.kind==='amendment'?'уточнення':'інструкція'}, джерело: ${entry.source==='form'?'історія у формі':'повідомлення '+entry.source_message_id}): ${entry.text}`).join('\n');
}
