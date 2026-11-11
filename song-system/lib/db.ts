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
import { landingDefaults, deadline, plans, type Order, type Media, orderSchema, updateSchema } from './model';
let instance:LocalDatabase;
export function db(){
 if(process.env.LOCAL_ONLY!=='1'||process.env.VERCEL) throw new Error('Local storage only: configure cloud persistence before deployment');
 if(!instance){const dir=process.env.DATA_DIR||join(process.cwd(),'data');mkdirSync(dir,{recursive:true});instance=new LocalDatabase(join(dir,'system.sqlite'));instance.exec('PRAGMA journal_mode = WAL');instance.exec(`CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, requestId TEXT UNIQUE NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY, orderId TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, orderId TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL);`)}return instance;
}
export function listOrders():Order[]{return db().prepare('SELECT body FROM orders ORDER BY rowid DESC').all().map((r:any)=>{const o=JSON.parse(r.body);o.paid=(db().prepare('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE orderId=?').get(o.id) as any).total;return o})}
export function createOrder(input:unknown,source?:Order['source']){const p=orderSchema.parse(input);return db().transaction(()=>{const old=db().prepare('SELECT body FROM orders WHERE requestId=?').get(p.requestId) as any;if(old)return JSON.parse(old.body).id;const id=randomUUID();const defaults=p.source_page?landingDefaults[p.source_page]:undefined;const provisional=defaults?Object.fromEntries(Object.entries(defaults).filter(([key,value])=>p[key as 'recipient'|'occasion']===value)):undefined;const o={...p,landing_defaults:provisional,source,id,createdAt:new Date().toISOString(),status:'Нове звернення',notes:'',nextAction:'Зв’язатися та уточнити історію',briefAt:null,dueAt:null,revision:0,paymentLink:'',amount:plans[p.plan],paid:0};db().prepare('INSERT INTO orders VALUES(?,?,?)').run(id,p.requestId,JSON.stringify(o));return id})()}
export function updateOrder(input:unknown){
 const p=updateSchema.parse(input);
 const database=db();
 return database.transaction(()=>{
  const row=database.prepare('SELECT body FROM orders WHERE id=?').get(p.id) as {body:string}|undefined;
  if(!row)throw new Error('NOT_FOUND');
  const before=JSON.parse(row.body) as Order;
  if(before.revision!==p.revision)throw new Error('CONFLICT');

  const at=new Date().toISOString();
  const briefAt=before.briefAt||(p.completeBrief?at:null);
  const {total}=database.prepare('SELECT COALESCE(SUM(amount),0) total FROM payments WHERE orderId=?').get(p.id) as {total:number};
  before.paid=total;
  const paid=total+(p.payment?.amount??0);
  const minimumToStart=Math.min(before.amount,100000);
  const isIntakeStage=(status:Order['status'])=>status==='Нове звернення'||status==='Збір інформації';
  const startLyrics=isIntakeStage(before.status)&&isIntakeStage(p.status)&&!!briefAt&&paid>=minimumToStart;
  const order:Order={
   ...before, paid, status:startLyrics?'Текст':p.status,
   nextAction:startLyrics?'Підготувати текст пісні':p.nextAction,
   notes:p.notes, paymentLink:p.paymentLink, briefAt,
   paymentDetailsSharedAt:before.paymentDetailsSharedAt||(p.paymentDetailsShared?at:undefined),
   followupOptOut:p.followupOptOut??before.followupOptOut,
   followupDoubtAt:p.followupDoubt===undefined?before.followupDoubtAt:p.followupDoubt?(before.followupDoubtAt||at):undefined,
   followupSentAt:p.followupSent?at:before.followupSentAt,
   dueAt:briefAt?deadline(briefAt):null, revision:before.revision+1
  };

  if(p.payment)database.prepare('INSERT INTO payments VALUES(?,?,?,?,?)').run(randomUUID(),p.id,p.payment.amount,p.payment.note,at);
  database.prepare('UPDATE orders SET body=? WHERE id=?').run(JSON.stringify(order),p.id);
  database.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(randomUUID(),p.id,JSON.stringify({before,after:order,payment:p.payment||null,actor:'Костя'}),at);
  return order;
 })()
}
export function listMedia(publicOnly=false):Media[]{return db().prepare('SELECT body FROM media').all().map((r:any)=>JSON.parse(r.body)).filter((m:Media)=>!publicOnly||(m.published&&m.consent)).sort((a:Media,b:Media)=>a.position-b.position)}
export function saveMedia(m:Media){db().prepare('INSERT OR REPLACE INTO media VALUES(?,?)').run(m.id,JSON.stringify(m))}
