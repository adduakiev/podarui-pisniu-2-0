// Conservative local interpretation based on the brand's conversation guide.
// Only explicit details are extracted; the original message stays in history.
export type Tone='memory'|'distance'|'joy'|'neutral';
export function toneOf(text:string):Tone{
 if(/(?:на|у) пам[’'ʼ]ять|пісн\S* пам[’'ʼ]яті|помер|покійн|загинув|загинула|втратил/iu.test(text))return 'memory';
 if(/захища[єю].*україн|військов|служить|службі|на відстані|розлук/iu.test(text))return 'distance';
 return /річниц|весіл|народжен|ювіл/iu.test(text)?'joy':'neutral';
}
export function explicitDetails(text:string){
 const parts=text.split(/[,;\n]/u).map(part=>part.trim());
 const occasion=text.match(/(?:на |до )?(?:річниц[юі]|день народження|дня народження|весілля|ювілей)(?: весілля)?/iu)?.[0];
 const eventDate=text.match(/(?:^|(?:до|потрібно|подарунок на)\s+)(\d{1,2}\s+(?:січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)(?:\s+20\d{2})?)(?=$|[\s,.;!?])/iu)?.[1];
 const sound=parts.find(part=>/^(?:(?:хочу|бажано|можна)\s+)?(?:(?:жіноч|чоловіч)\S*\s+голос\S*|дует|(?:ніжн\S*|романтичн\S*|весел\S*)\s+(?:балад\S*|пісн\S*)|романтичне|ніжно|весело)(?=$|[\s.!])/iu.test(part));
 const avoid=text.match(/(?:^|[,;]\s*)(?:не згадуйте|не згадувати|без згадки про)\s+([^,;.!]+)/iu)?.[1];
 const sender=text.match(/(?:її|його|дружину|чоловіка|маму|тата)\s+звати\s+([\p{L}’'ʼ-]+)/iu)?.[1];
 const story=/(?:познайомил|закохал|живемо разом|маємо (?:сина|доньку|дітей)|хочу сказати|хочу подякувати|пам[’'ʼ]ятаю)/iu.test(text)?text:undefined;
 return {occasion,eventDate,sound,avoid,sender,story};
}
export function reaction(tone:Tone){
 switch(tone){
  case 'memory':return 'Мені шкода Вашої втрати. Дякую, що довірили нам цю історію.';
  case 'distance':return 'Дякую, що поділилися. Допоможемо передати в пісні те, що важливо сказати на відстані.';
  case 'joy':return 'Яка гарна нагода подарувати пісню про Вас двох!';
  default:return '';
 }
}
