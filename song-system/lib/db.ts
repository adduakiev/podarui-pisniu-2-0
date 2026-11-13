import {captureForm,orderContacts} from './crm-records';
import { DatabaseSync } from 'node:sqlite';
class LocalDatabase extends DatabaseSync {
 transaction<T>(fn:()=>T){
  return ()=>{
   const nested=this.isTransaction;
   this.exec(nested?'SAVEPOINT local_transaction':'BEGIN IMMEDIATE');
   try {
    const result=fn();
    this.exec(nested?'RELEASE local_transaction':'COMMIT');
    return result;
   } catch(error) {
    this.exec(nested?'ROLLBACK TO local_transaction; RELEASE local_transaction':'ROLLBACK');
    throw error;
   }
  }
 }
}
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultPaymentTerms, type PaymentTerms, type LyricsTask, landingDefaults, deadline, plans, type Order, type Media, orderSchema, updateSchema } from './model';
let instance:LocalDatabase;
export function db(){
 if(process.env.LOCAL_ONLY!=='1'||process.env.VERCEL) throw new Error('Local storage only: configure cloud persistence before deployment');
 if(!instance){const dir=process.env.DATA_DIR||join(process.cwd(),'data');mkdirSync(dir,{recursive:true});instance=new LocalDatabase(join(dir,'system.sqlite'));instance.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000');instance.exec(`CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, requestId TEXT UNIQUE NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, orderId TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, orderId TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL);`);instance.exec(`
 CREATE TABLE IF NOT EXISTS owner_commands(commandId TEXT PRIMARY KEY,payload TEXT NOT NULL,result TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS payment_metadata(paymentId TEXT PRIMARY KEY,commandId TEXT UNIQUE NOT NULL,currency TEXT NOT NULL,actor TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS lyrics_tasks(id TEXT PRIMARY KEY,orderId TEXT NOT NULL,purpose TEXT NOT NULL,version INTEGER NOT NULL,body TEXT NOT NULL,UNIQUE(orderId,purpose,version));
 CREATE TRIGGER IF NOT EXISTS payments_immutable_update BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAYMENT'); END;
 CREATE TRIGGER IF NOT EXISTS payments_immutable_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAYMENT'); END;
 `)}return instance;
}
function withTermsAndTask(o:Order):Order{
 o.contacts=orderContacts(db(),o);
 o.payment_terms??=defaultPaymentTerms(o.amount);
 const task=db().prepare("SELECT body FROM lyrics_tasks WHERE orderId=? AND purpose='lyrics' AND version=1").get(o.id) as {body:string}|undefined;
 if(task)o.lyricsTask=JSON.parse(task.body);
 return o;
}
export function listOrders():Order[]{return db().prepare('SELECT body FROM orders ORDER BY rowid DESC').all().map((r:any)=>{const o=JSON.parse(r.body);o.paid=(db().prepare('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE orderId=?').get(o.id) as any).total;return withTermsAndTask(o)})}
export function createOrder(input:unknown,source?:Order['source']){const p=orderSchema.parse(input);return db().transaction(()=>{const old=db().prepare('SELECT body FROM orders WHERE requestId=?').get(p.requestId) as any;if(old)return JSON.parse(old.body).id;const id=randomUUID();const defaults=p.source_page?landingDefaults[p.source_page]:undefined;const provisional=defaults?Object.fromEntries(Object.entries(defaults).filter(([key,value])=>p[key as 'recipient'|'occasion']===value)):undefined;const {contacts:suppliedContacts,...fields}=p;const o={...fields,landing_defaults:provisional,source,id,createdAt:new Date().toISOString(),status:'Нове звернення',notes:'',nextAction:'Зв’язатися та уточнити історію',briefAt:null,dueAt:null,revision:0,paymentLink:'',amount:plans[p.plan],payment_terms:defaultPaymentTerms(plans[p.plan]),paid:0};db().prepare('INSERT INTO orders VALUES(?,?,?)').run(id,p.requestId,JSON.stringify(o));captureForm(db(),o,suppliedContacts);return id})()}
// actor is supplied only by the authenticated owner route, never parsed from JSON.
export function updateOrder(input:unknown,actor?:{role:'owner';name:string}){
 const p=updateSchema.parse(input);
 const financial=!!(p.payment||p.confirmTerms||p.termsMode||p.deferPaymentReason);
 if(financial&&(!actor||actor.role!=='owner'||!actor.name.trim()))throw new Error('OWNER_REQUIRED');
 if(financial&&!p.commandId)throw new Error('COMMAND_ID_REQUIRED');
 const payload=JSON.stringify({p,actor:actor?.name});
 const database=db();
 return database.transaction(()=>{
  if(p.commandId){
   const prior=database.prepare('SELECT payload,result FROM owner_commands WHERE commandId=?').get(p.commandId) as {payload:string;result:string}|undefined;
   if(prior){if(prior.payload!==payload)throw new Error('COMMAND_REUSED');return JSON.parse(prior.result) as Order;}
  }
  const row=database.prepare('SELECT body FROM orders WHERE id=?').get(p.id) as {body:string}|undefined;
  if(!row)throw new Error('NOT_FOUND');
  const before=JSON.parse(row.body) as Order;
  if(before.revision!==p.revision)throw new Error('CONFLICT');

  const at=new Date().toISOString();
  const briefAt=before.briefAt||(p.completeBrief?at:null);
  const {total}=database.prepare('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE orderId=?').get(p.id) as {total:number};
  before.paid=total;
  const paid=total+(p.payment?.amount??0);
  const terms:PaymentTerms={...(before.payment_terms??defaultPaymentTerms(before.amount))};
  if(p.termsMode&&p.termsMode!==terms.mode&&terms.agreedAt)throw new Error('TERMS_REVIEW_REQUIRED');
  if(p.termsMode&&!p.confirmTerms)throw new Error('TERMS_CONFIRMATION_REQUIRED');
  if(p.deferPaymentReason&&p.termsMode!=='owner_deferred')throw new Error('INVALID_DEFERRED_TERMS');
  if(p.confirmTerms&&!terms.agreedAt){
   terms.mode=p.termsMode??terms.mode;
   terms.total=before.amount;
   if(terms.mode==='owner_deferred'){
    if(before.plan!=='military'||!p.deferPaymentReason)throw new Error('DEFERRED_AUTHORIZATION_REQUIRED');
    terms.required_before_start=0;terms.balance_due_trigger='song_sent';
    terms.owner_authorization={actor:actor!.name,at,reason:p.deferPaymentReason};
   }else if(terms.mode==='full_prepayment'){
    terms.required_before_start=before.amount;terms.balance_due_trigger='before_start';
   }
   terms.agreedAt=at;
  }
  const authorizedTerms=!!terms.agreedAt&&terms.total===before.amount&&
   (terms.mode!=='owner_deferred'||(before.plan==='military'&&!!terms.owner_authorization));
  const eligible=!!briefAt&&authorizedTerms&&paid>=terms.required_before_start;
  // A manual stage change must not bypass the same gate used by automatic intake.
  if(['Текст','Музика','Перевірка','Передано','Завершено'].includes(p.status)&&
     ['Нове звернення','Збір інформації','Відкладено'].includes(before.status)&&!eligible)throw new Error('START_NOT_AUTHORIZED');
  if(['Музика','Перевірка','Передано','Завершено'].includes(p.status)&&['Нове звернення','Збір інформації','Відкладено'].includes(before.status))throw new Error('START_AT_LYRICS_REQUIRED');
  const isIntakeStage=(status:Order['status'])=>status==='Нове звернення'||status==='Збір інформації';
  const startLyrics=isIntakeStage(before.status)&&isIntakeStage(p.status)&&eligible;
  const order:Order={
   ...before, payment_terms:terms, paid, status:startLyrics?'Текст':p.status,
   nextAction:startLyrics?'Підготувати текст пісні':p.nextAction,
   notes:p.notes, paymentLink:p.paymentLink, briefAt,
   paymentDetailsSharedAt:before.paymentDetailsSharedAt||(p.paymentDetailsShared?at:undefined),
   followupOptOut:p.followupOptOut??before.followupOptOut,
   followupDoubtAt:p.followupDoubt===undefined?before.followupDoubtAt:p.followupDoubt?(before.followupDoubtAt||at):undefined,
   followupSentAt:p.followupSent?at:before.followupSentAt,
   dueAt:briefAt?deadline(briefAt):null, revision:before.revision+1
  };

  if(p.payment){
   const paymentId=randomUUID();
   database.prepare('INSERT INTO payments VALUES(?,?,?,?,?)').run(paymentId,p.id,p.payment.amount,p.payment.note,at);
   database.prepare('INSERT INTO payment_metadata VALUES(?,?,?,?)').run(paymentId,p.commandId!,'UAH',actor!.name);
  }
  if(eligible&&order.status==='Текст'&&['Нове звернення','Збір інформації','Відкладено'].includes(before.status)){
   const task:LyricsTask={id:randomUUID(),orderId:p.id,purpose:'lyrics',version:1,state:'pending',createdAt:at,dueAt:order.dueAt!,assignee:'owner',
    brief:{recipient:order.recipient,occasion:order.occasion,story:order.story,notes:order.notes,briefAt:briefAt!},payment_terms:terms};
   database.prepare('INSERT INTO lyrics_tasks VALUES(?,?,?,?,?) ON CONFLICT(orderId,purpose,version) DO NOTHING').run(task.id,p.id,'lyrics',1,JSON.stringify(task));
  }
  // The task snapshot stays immutable even when later CRM notes change.
  withTermsAndTask(order);
  database.prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify(order),p.id);
  database.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(randomUUID(),p.id,JSON.stringify({before,after:order,payment:p.payment||null,actor:actor?.name??'system'}),at);
  if(p.commandId)database.prepare('INSERT INTO owner_commands VALUES(?,?,?)').run(p.commandId,payload,JSON.stringify(order));
  return JSON.parse(JSON.stringify(order)) as Order;
 })()
}
export function listMedia(publicOnly=false):Media[]{return db().prepare('SELECT body FROM media').all().map((r:any)=>JSON.parse(r.body)).filter((m:Media)=>!publicOnly||(m.published&&m.consent)).sort((a:Media,b:Media)=>a.position-b.position)}
export function saveMedia(m:Media){db().prepare('INSERT OR REPLACE INTO media VALUES(?,?)').run(m.id,JSON.stringify(m))}
