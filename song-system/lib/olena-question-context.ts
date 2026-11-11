import type {Interpretation} from './olena-interpreter';
type Field=Interpretation['updates'][number]['field'];
// Derive context from the actual persisted assistant turn, never from a model
// update's proposed field or the next missing slot. More than one field is ambiguous.
export function askedQuestionField(text:string):Field|undefined{
 const questions=text.match(/[^.!?]*\?/gu)||[];
 const fields=new Set<Field>();
 const namedPeople=new Set<string>();
 for(const question of questions){
  // One field can still refer to several people. A bare name cannot select
  // between the customer and recipient, or between two named relationships.
  if(/як\s+звати|ім[’'ʼ]я/iu.test(question)){
   const people=question.match(/(?<![\p{L}])(?:вас|тебе|мам[\p{L}]*|тат[\p{L}]*|бабус[\p{L}]*|дідус[\p{L}]*|сестр[\p{L}]*|брат[\p{L}]*|дружин[\p{L}]*|чоловік[\p{L}]*|чоловіка|доньк[\p{L}]*|син[\p{L}]*|отримувач[\p{L}]*|людин[\p{L}]*)(?=$|[^\p{L}])/giu)||[];
   for(const person of people){
    const target=person.toLowerCase().match(/^(?:мам|тат|бабус|дідус|сестр|брат|дружин|чоловік|чоловіка|доньк|син|отримувач|людин)/u)?.[0]||'customer';
    namedPeople.add(target==='чоловіка'?'чоловік':target);
   }
   if(namedPeople.size>1)return undefined;
  }
  if(/(?:як\s+звати|як(?:е|им)\s+ім[’'ʼ]я|ім[’'ʼ]я\s+(?:отримувач|мам|тат|людин))/iu.test(question)&&/мам|тат|бабус|дідус|сестр|брат|дружин|чоловік|чоловіка|доньк|син|отримувач|людин|її|його/iu.test(question))fields.add('sender');
  if(/від\s+(?:кого|чийого)(?=\s|[?—,-]|$)/iu.test(question))fields.add('narrator');
  if(/для\s+кого|кому\s+(?:присвят|подар|створ)|хто\s+отримувач/iu.test(question))fields.add('recipient');
  if(/нагод|привід|привод|сюрприз\s+просто\s+так/iu.test(question))fields.add('occasion');
  if(/яку?\s+дат|коли\s+(?:потріб|подар|свят)|до\s+якої\s+дат/iu.test(question))fields.add('eventDate');
  if(/яки[йм]\s+(?:спільний\s+|особистий\s+)?(?:спогад|момент)|яка\s+маленька\s+деталь|яку\s+головну\s+думку|які\s+слова|яким\s+спогадом/iu.test(question))fields.add('story');
  if(/який\s+(?:голос|стиль|настрій)|яке\s+звучання/iu.test(question))fields.add('sound');
  if(/чого\s+не\s+згадувати|що\s+не\s+згадувати|які\s+(?:слова|звертання)[^?]*не\s+використовувати/iu.test(question))fields.add('avoid');
 }
 if(!questions.length&&/надішліть[^.!?]*ваш\s+текст/iu.test(text))fields.add('story');
 return fields.size===1?[...fields][0]:undefined;
}
