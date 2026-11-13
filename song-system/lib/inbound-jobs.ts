import {captureInbound} from './crm-records';
import {randomUUID} from 'node:crypto';
import {db} from './db';
import {dialogueContext} from './conversation';
export type Channel='site'|'telegram'|'instagram';
export type JobInput={orderId:string;channel:Channel;eventId:string;message?:string;confirm?:boolean};
export type Job={id:string;input:JobInput;state:'pending'|'processing'|'prepared'|'sending'|'uncertain'|'completed'|'ready_for_operator'|'withheld'|'reconciled';revision:number;token:string;leaseUntil:number;attempts:number;result?:any;error?:string;history:{at:string;actor:string;action:string;reason?:string;commandId?:string}[]};
export function jobsDb(){const d=db();d.exec('CREATE TABLE IF NOT EXISTS inbound_jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL)');return d;}
export const jobId=(channel:Channel,eventId:string)=>JSON.stringify([channel,eventId]);
export function readJob(id:string):Job|undefined{const row=jobsDb().prepare('SELECT body FROM inbound_jobs WHERE id=?').get(id) as {body:string}|undefined;return row?JSON.parse(row.body):undefined;}
export function writeJob(j:Job){jobsDb().prepare('INSERT OR REPLACE INTO inbound_jobs VALUES(?,?)').run(j.id,JSON.stringify(j));}
export function ensureInboundJob(input:JobInput){return jobsDb().transaction(()=>{
 const normalized={orderId:input.orderId,channel:input.channel,eventId:input.eventId,message:input.message,confirm:!!input.confirm};
 const id=jobId(input.channel,input.eventId),old=readJob(id);
 if(old){if(JSON.stringify(old.input)!==JSON.stringify(normalized))throw Error('INBOUND_ID_REUSED');return old;}
 const j:Job={id,input:normalized,state:'pending',revision:dialogueContext(input.orderId).revision,token:'',leaseUntil:0,attempts:0,history:[]};writeJob(j);captureInbound(jobsDb(),input);return j;
})();}
export function claimJob(input:JobInput,recovery?:{actor:string;reason:string;commandId:string}){return jobsDb().transaction(()=>{
 const j=ensureInboundJob(input);
 if(recovery){
  if(j.history.some(h=>h.commandId===recovery.commandId))throw Error('COMMAND_ALREADY_APPLIED');
  if(!['pending','processing','prepared'].includes(j.state))throw Error('RECOVERY_NOT_ALLOWED');
  if(j.leaseUntil>Date.now())throw Error('LEASE_ACTIVE');
  j.history.push({at:new Date().toISOString(),actor:recovery.actor,action:'recover',reason:recovery.reason,commandId:recovery.commandId});
 }else if(j.state!=='pending')throw Error(j.state==='processing'?'INBOUND_IN_PROGRESS':'JOB_ALREADY_CLAIMED');
 j.state='processing';j.token=randomUUID();j.leaseUntil=Date.now()+60000;j.attempts++;writeJob(j);return j;
})();}
export function claimCurrent(id:string,token:string){const j=readJob(id);return !!j&&j.token===token&&j.state==='processing'&&j.leaseUntil>Date.now();}
export function finishJob(id:string,token:string,result:any,recovered=false){return jobsDb().transaction(()=>{
 const j=readJob(id)!;if(!claimCurrent(id,token))throw Error('CLAIM_LOST');
 const c=dialogueContext(result.orderId);
 j.result=result;j.state=recovered?(result.suppressReply||c.mode==='producer'||c.contactPaused||c.orderId!==j.input.orderId||c.revision!==result.deliveryRevision?'withheld':'ready_for_operator'):(j.input.channel==='site'?'completed':'prepared');
 if(recovered||j.input.channel==='site')j.leaseUntil=0;
 writeJob(j);return j;
})();}
export function preparedCurrent(channel:Channel,eventId:string,token?:string){const j=readJob(jobId(channel,eventId));return !!j&&!!token&&j.token===token&&j.state==='prepared'&&j.leaseUntil>Date.now();}
export function beginDelivery(channel:Channel,eventId:string,token?:string){return jobsDb().transaction(()=>{
 const j=readJob(jobId(channel,eventId));if(!j||!token||j.token!==token||j.state!=='prepared'||j.leaseUntil<=Date.now())return false;
 const c=dialogueContext(j.result.orderId);
 if(c.orderId!==j.result.orderId||c.revision!==j.result.deliveryRevision){j.state='withheld';j.leaseUntil=0;writeJob(j);return false;}
 j.state='sending';j.leaseUntil=Date.now()+60000;writeJob(j);return true;
})();}
export function endDelivery(channel:Channel,eventId:string,token:string|undefined,uncertain:boolean){return jobsDb().transaction(()=>{const j=readJob(jobId(channel,eventId));if(j&&j.token===token&&j.state==='sending'){j.state=uncertain?'uncertain':'completed';j.leaseUntil=0;writeJob(j);}})();}
export function suppressJob(channel:Channel,eventId:string,token?:string){return jobsDb().transaction(()=>{const j=readJob(jobId(channel,eventId));if(j&&j.token===token&&j.state==='prepared'){j.state='withheld';j.leaseUntil=0;writeJob(j);}})();}
// Import old common receipts conservatively. Missing adapter binding is never guessed.
export function importLegacyJobs(){const d=jobsDb();if(!d.prepare("SELECT 1 FROM sqlite_master WHERE name='dialogue_inbound'").get())return;
 d.transaction(()=>{for(const row of d.prepare("SELECT * FROM dialogue_inbound WHERE state!='done'").all() as any[]){const id=jobId(row.channel,row.eventId);if(readJob(id))continue;const p=JSON.parse(row.input);let revision=-1;if(d.prepare("SELECT 1 FROM sqlite_master WHERE name='conversation_reservations'").get()){const r=d.prepare('SELECT revision FROM conversation_reservations WHERE orderId=? AND requestId=?').get(row.orderId,row.channel+':'+row.eventId) as any;if(r)revision=r.revision;}
 const j=ensureInboundJob({...p,channel:row.channel,eventId:row.eventId});j.state='processing';j.revision=revision;j.error=revision<0?'Legacy revision unknown: recovery will withhold stale intent':undefined;writeJob(j);
 }})();
}
function importLegacyDeliveries(){const d=jobsDb();
 const exists=(name:string)=>!!d.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name);
 const receipt=(channel:Channel,eventId:string)=>exists('dialogue_inbound')?d.prepare('SELECT * FROM dialogue_inbound WHERE channel=? AND eventId=?').get(channel,eventId) as any:undefined;
 const add=(channel:Channel,eventId:string,original:any,uncertain:boolean,fallback?:JobInput)=>{
  if(readJob(jobId(channel,eventId)))return;
  const input:JobInput=original?{...JSON.parse(original.input),channel,eventId}:fallback!;
  if(!input)return;
  const j=ensureInboundJob(input);j.leaseUntil=0;j.revision=-1;
  j.result=original?.result?JSON.parse(original.result):undefined;
  j.state=uncertain?'uncertain':j.result?'prepared':'withheld';
  if(j.result)j.revision=j.result.deliveryRevision;
  j.error=uncertain?'Legacy transport outcome unknown; no automatic resend':!original?'Legacy binding/revision requires manual review':undefined;writeJob(j);
 };
 d.transaction(()=>{
  if(exists('instagram_inbound'))for(const r of d.prepare('SELECT * FROM instagram_inbound WHERE sentAt IS NULL').all() as any[]){
   const eventId=JSON.stringify([r.accountId,r.inboundId,'message']);const old=receipt('instagram',eventId);const thread=exists('instagram_threads')?d.prepare('SELECT orderId FROM instagram_threads WHERE accountId=? AND senderId=?').get(r.accountId,r.senderId) as any:undefined;
   const payload=exists('instagram_inbound_payloads')?d.prepare('SELECT message FROM instagram_inbound_payloads WHERE accountId=? AND inboundId=?').get(r.accountId,r.inboundId) as any:undefined;
   add('instagram',eventId,old,!!r.reply,thread?{orderId:thread.orderId,channel:'instagram',eventId,message:payload?.message}:undefined);
  }
  if(exists('telegram_deliveries'))for(const r of d.prepare('SELECT * FROM telegram_deliveries').all() as any[]){const body=JSON.parse(r.body);const unfinished=body.preparing||body.outbound.some((o:any)=>['pending','sending','uncertain'].includes(o.state));if(!unfinished)continue;
   const eventId=String(r.updateId),old=receipt('telegram',eventId),orderId=body.outbound.find((o:any)=>o.orderId)?.orderId;
   add('telegram',eventId,old,body.outbound.some((o:any)=>['sending','uncertain'].includes(o.state)),orderId?{orderId,channel:'telegram',eventId,message:body.inbound?.message?.text}:undefined);
  }
 })();
}
export function listRecoveryJobs(){importLegacyJobs();importLegacyDeliveries();return jobsDb().prepare('SELECT body FROM inbound_jobs ORDER BY rowid DESC').all().map((r:any)=>JSON.parse(r.body) as Job).filter(j=>!['completed','reconciled'].includes(j.state)).map(j=>({...j,expired:j.leaseUntil<=Date.now(),token:undefined}));}
