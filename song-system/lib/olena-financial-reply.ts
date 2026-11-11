import type {Order} from './model';
export type FinancialReplyState = {paid:number;amount:number;confirmed:boolean;status:Order['status']};
// These are claims about this order, not instructions that may change its state.
// Payment evidence comes from the ledger; workflow and approval are independent.
export function unsupportedFinancialReply(reply:string,state:FinancialReplyState){
 const clauses=reply.toLowerCase().split(/[.!?;\n]+|,?\s+(?:але|проте|однак|зате)\s+|,(?!\s*(?:що|чи)\s)\s*|\s+(?:і|та)\s+(?=(?:кошти|гроші|платіж|замовлення|ми|автор|це)(?:\s|$))/u);
 for(const raw of clauses){
  // Remove only a negated predicate; a separate positive claim must still
  // be checked against its own authoritative state.
  const clause=raw.trim().replace(/(?<![\p{L}])не\s+(?:погод|узгод|підтверд|почал|працю|отрим|надійш|зарах|успіш|сплач)\S*/gu,' ');
  if(!clause)continue;
  // No refund record/workflow exists. Incoming payment is never evidence of
  // an approved or executed refund. Match affirmative current-order claims,
  // not conditional policy, producer checks, negation or attributed history.
  const refundClaim=/^(?:(?:я|ми)\s+)?(?:вже\s+)?(?:оформила|оформили|оформлено|виконала|виконали|виконано|погодила|погодили|погоджено|схвалила|схвалили|схвалено)\s+повернення(?:\s|$)/u.test(clause)
   ||/^(?:повернення(?:\s+коштів)?|кошти|гроші)\s+(?:вже\s+)?(?:повернуто|повернено|погоджено|схвалено|оформлено|виконано)(?:\s|$)/u.test(clause);
  if(refundClaim)return true;
  const disclaimer=/^(?:я\s+|ми\s+)?не\s+(?:(?:можу|можемо)\s+)?(?:підтверд|ствердж|гаранту|обіця)/u.test(clause);
  if(disclaimer)continue;
  const received=/(?:платіж|кошти|гроші)[^.!?]*(?:успіш|отрим|надійш|зарах|підтверд|проведе)|(?:отримали|отримано|надійшли|зараховано)[^.!?]*(?:кошти|гроші|платіж)/u.test(clause);
  const settled=/(?:повністю|все|усе)\s+(?:сплач|оплач)|(?:сплач|оплач)\S*\s+повністю|повністю\s+розрахува|нічого\s+доплачувати\s+не\s+(?:потрібно|треба)|борг\S*\s+немає/u.test(clause);
  if(received&&state.paid<=0||settled&&state.paid<state.amount)return true;
  const free=/(?:^|\s)(?:це|пісня|пісню|замовлення|послуга|для вас)[^.!?]*(?:безкоштов|безплат)|^(?:безкоштовно|безплатно)$|(?:платити|сплачувати)\s+не\s+(?:потрібно|треба)|нічого\s+не\s+коштує/u.test(clause);
  if(free&&state.amount!==0)return true;
  const agreed=/(?:замовлення|бриф|історію|задум)[^.!?]*(?:погодил|погоджен|узгодил|узгоджен|підтверд|затвердж)|(?:погодил|затвердил|узгодил)\S*[^.!?]*(?:бриф|замовлення)|^(?:усе\s+)?(?:погоджено|узгоджено|підтверджено)$/u.test(clause);
  if(agreed&&!state.confirmed)return true;
  const lyrics=/автор[^.!?]*(?:працює[^.!?]*текст|взявся[^.!?]*робот)|робот\S*[^.!?]*текст[^.!?]*розпочат/u.test(clause);
  const started=/(?:ми|команда)[^.!?]*почали[^.!?]*(?:створ|робот)|(?:почали|почалася|розпочали)[^.!?]*(?:робот|створ|пісн)|працюємо[^.!?]*пісн|робот\S*[^.!?]*пісн[^.!?]*(?:почат|розпочат)/u.test(clause);
  const finished=/пісн\S*[^.!?]*(?:вже\s+)?готов\S*|(?:завершили|закінчили)[^.!?]*пісн/u.test(clause);
  if(finished&&!['Передано','Завершено'].includes(state.status))return true;
  if(lyrics&&state.status!=='Текст')return true;
  if(started&&!['Текст','Музика','Перевірка','Передано','Завершено'].includes(state.status))return true;
 }
 return false;
}

// Prefer the narrow backend fact over a model's stronger claim about a person
// actively working. Also render ledger-backed partial receipt without demanding payment.
export function financialReplyText(reply:string,state:FinancialReplyState){
 if(/^Отримали часткову оплату[.!]?$/iu.test(reply)&&state.paid>0&&state.paid<state.amount)return 'Отримали частину коштів.';
 if(/^(?:Автор[^.!?]*(?:працює|взявся)|Роботу над текстом розпочато)[^!?]*[.]?$/iu.test(reply)&&state.status==='Текст')return 'Замовлення на етапі підготовки тексту.';
 return reply;
}
