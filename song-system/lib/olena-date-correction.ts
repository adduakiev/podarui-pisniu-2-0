const months=['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
type DateParts={day:number;month:number;year?:number};
function parseDate(value:string):DateParts|undefined{
 const text=value.trim().toLocaleLowerCase('uk');
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);
 const words=/^(\d{1,2})\s+([а-яіїєґ]+)(?:\s+(\d{4})(?:\s+року)?)?$/u.exec(text);
 if(!iso&&!words)return;
 const day=Number(iso?.[3]||words?.[1]),month=iso?Number(iso[2]):months.indexOf(words![2])+1;
 const year=iso?Number(iso[1]):words?.[3]?Number(words[3]):undefined;
 if(month<1||month>12||year!==undefined&&year<1)return;
 // A missing year stays missing. February29 is possible, not an inferred year.
 const leap=year===undefined||year%4===0&&(year%100!==0||year%400===0);
 const max=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
 if(day<1||day>max)return;
 return {day,month,year};
}
// undefined: unrelated message; null: correction intent needs clarification.
export function naturalEventDateCorrection(message:string,current:string):string|null|undefined{
 const text=message.trim().replace(/[.!]$/u,'').trim();
 const prefix='(?:(?:перепрошую|вибачте)[,:]?\\s*)?';
 const replacement=new RegExp('^'+prefix+'(?:свято|подія|день народження|річниця)\\s+(?:буде|відбудеться)\\s+(.+?)\\s*,?\\s+а не\\s+(.+)$','iu').exec(text);
 const dedicated=new RegExp('^'+prefix+'(?:уточню|виправлю)\\s+дату(?:\\s+(?:свята|події|подарунка))?\\s*[:—-]\\s*(.+)$','iu').exec(text);
 if(!replacement&&!dedicated)return;
 const value=(replacement?.[1]||dedicated![1]).trim().toLocaleLowerCase('uk');
 const next=parseDate(value);if(!next)return null;
 if(replacement){
  const old=parseDate(replacement[2]),known=parseDate(current);
  if(!old||!known||old.day!==known.day||old.month!==known.month||old.year!==undefined&&old.year!==known.year)return null;
 }
 return value;
}

// Explicit withdrawal of the optional event date only, never order cancellation.
// Whole-message matching excludes negation, questions, quotes and narrative mentions.
export function explicitEventDateWithdrawal(message:string):boolean{
 return /^(?:(?:перепрошую|вибачте)[,!]?\s*)?(?:(?:(?:попередню|стару|вказану)\s+)?дату(?:\s+(?:свята|події|подарунка))?\s+скасували|(?:приберіть|заберіть)\s+(?:(?:попередню|стару|вказану)\s+)?дату(?:\s+(?:свята|події|подарунка))?)(?:[.!]\s*(?:нової|точної)\s+дати\s+(?:(?:поки|ще)\s+)?(?:не знаю|немає|нема))?[.!]?$/iu.test(message.trim());
}
