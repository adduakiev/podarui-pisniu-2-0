import type {Order} from './model';

// Bounded completed-delivery checks, not a semantic proof. Current integrations
// provide neither agent-performed song delivery evidence nor recipient receipts.
export function unsupportedDeliveryReply(reply:string,status:Order['status']){
 const clauses=reply.toLowerCase().split(/(?<=[.!?;\n])\s*|,?\s+(?:але|проте|однак|зате)\s+|,(?!\s*(?:що|чи)\s)\s*|\s+(?:і|та)\s+(?=(?:я|ми|файл|ваша|ваш|ви|отримувач|адресат)\s)/u);
 for(const raw of clauses){
  const text=raw.trim();
  if(!text||text.endsWith('?'))continue;
  if(/^замовлення\s+має\s+статус\s+[«"“]?передано[»"”]?[.!]?$/u.test(text)){
   if(status!=='Передано')return true;
   continue;
  }
  if(/^(?:я\s+|ми\s+)?не\s+(?:(?:можу|можемо)\s+)?(?:підтверд|ствердж|гаранту|обіця)/u.test(text))continue;
  // Remove only a locally negated predicate, not a later affirmative clause.
  const clause=text.replace(/(?<![\p{L}])не\s+(?:(?:вже|ще)\s+)?(?:надісла|відправ|достав|переда|отрима)\p{L}*/gu,' ');
  const song=/mp3|файл\p{L}*|пісн\p{L}*/u.test(clause);
  const sent=/надісла(?:в|ла|ли|но)|відправ(?:ив|ила|или|лено)|достав(?:ив|ила|или|лено)|переда(?:в|ла|ли|но)/u.test(clause);
  const agent=/^(?:я|ми)\s/u.test(clause);
  const passiveFile=/^(?:(?:ваш\p{L}*|готов\p{L}*)\s+)?(?:файл\p{L}*|пісн\p{L}*|mp3)(?=\s|$)/u.test(clause);
  const recipient=/^(?:(?:ваш\p{L}*\s+)?(?:мама|мати|тато|батько|отримувач\p{L}*|адресат\p{L}*)|ви)(?=\s)/u.test(clause);
  if(song&&sent&&(agent||passiveFile))return true;
  if(song&&recipient&&/отрима(?:в|ла|ли|но)/u.test(clause))return true;
 }
 return false;
}
