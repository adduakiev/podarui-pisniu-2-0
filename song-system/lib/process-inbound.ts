import {randomUUID} from 'node:crypto';
import {claimJob,claimCurrent,finishJob,readJob,writeJob,jobsDb,jobId,importLegacyJobs,type JobInput} from './inbound-jobs';
import {db} from './db';
import {dialogueContext,dialogueSnapshot} from './conversation';
import {olenaDialogue} from './olena-dialogue';
import type {Interpreter} from './olena-interpreter';
export type InboundChannel='site'|'telegram'|'instagram';
export type Inbound={orderId:string;channel:InboundChannel;eventId?:string;message?:string;confirm?:boolean;snapshot?:boolean};
export const inboundSnapshot=(id:string)=>({...dialogueSnapshot(id),suppressReply:false,deliveryClaim:undefined as string|undefined});
// Durable receipt precedes interpretation. No transaction spans an await.
export async function processInbound(input:Inbound,interpreter?:Interpreter,recovery?:{actor:string;reason:string;commandId:string}){
 if(input.snapshot)return inboundSnapshot(input.orderId);
 const database=db();
 database.exec(`CREATE TABLE IF NOT EXISTS dialogue_inbound(channel TEXT NOT NULL,eventId TEXT NOT NULL,orderId TEXT NOT NULL,input TEXT NOT NULL,state TEXT NOT NULL,result TEXT,receivedAt TEXT NOT NULL,PRIMARY KEY(channel,eventId))`);
 const eventId=input.eventId??randomUUID();
 const payload=JSON.stringify({orderId:input.orderId,message:input.message,confirm:!!input.confirm});
 let claim:ReturnType<typeof claimJob>|undefined;
 const receipt=database.transaction(()=>{
  const old=database.prepare('SELECT input,state,result FROM dialogue_inbound WHERE channel=? AND eventId=?').get(input.channel,eventId) as {input:string;state:string;result:string}|undefined;
  if(old){if(old.input!==payload)throw Error('INBOUND_ID_REUSED');if(old.state==='processing'&&!recovery)throw Error('INBOUND_IN_PROGRESS');if(old.state==='done'&&!recovery)return old;}
  claim=claimJob({...input,eventId},recovery);
  if(old)database.prepare("UPDATE dialogue_inbound SET state='processing' WHERE channel=? AND eventId=?").run(input.channel,eventId);
  else database.prepare('INSERT INTO dialogue_inbound VALUES(?,?,?,?,?,?,?)').run(input.channel,eventId,input.orderId,payload,'processing',null,new Date().toISOString());
 })();
 if(receipt){
  const result=JSON.parse(receipt.result) as Awaited<ReturnType<typeof olenaDialogue>>;
  const current=dialogueContext(result.orderId);
  const safe=current.mode==='producer'||current.contactPaused||current.orderId!==result.orderId||current.revision!==result.deliveryRevision?dialogueSnapshot(current.orderId):result;
  return {...safe,suppressReply:true,deliveryRevision:current.revision,deliveryClaim:undefined as string|undefined};
 }
 try{
  const owned=claim!;
  const result:Awaited<ReturnType<typeof olenaDialogue>>&{suppressReply?:boolean}=recovery&&owned.result?owned.result:await olenaDialogue(input.orderId,input.message,!!input.confirm,interpreter,input.channel+':'+eventId,{revision:owned.revision,current:()=>claimCurrent(owned.id,owned.token)});
  const response={...result,suppressReply:'stale' in result&&!!result.stale,deliveryRevision:result.deliveryRevision};
  database.transaction(()=>{finishJob(owned.id,owned.token,response,!!recovery);database.prepare("UPDATE dialogue_inbound SET state='done',result=? WHERE channel=? AND eventId=?").run(JSON.stringify(response),input.channel,eventId);})();
  return {...response,deliveryClaim:owned.token};
 }catch(error){if(claim&&claimCurrent(claim.id,claim.token)){database.prepare("UPDATE dialogue_inbound SET state='failed' WHERE channel=? AND eventId=?").run(input.channel,eventId);const j=readJob(claim.id)!;j.error='Processing failed; owner reconciliation required';j.leaseUntil=0;writeJob(j);}throw error;}
}
export function deliveryCurrent(orderId:string,revision:number){const c=dialogueContext(orderId);return c.orderId===orderId&&c.revision===revision;}

export async function reconcileInbound(id:string,action:'recover'|'resolve',commandId:string,reason:string,actor?:{role:'owner';name:string},interpreter?:Interpreter){
 if(actor?.role!=='owner'||!actor.name.trim())throw Error('OWNER_REQUIRED');
 if(!reason.trim()||!commandId)throw Error('REASON_AND_COMMAND_REQUIRED');
 importLegacyJobs();
 const j=readJob(id);if(!j)throw Error('NOT_FOUND');
 const previous=j.history.find(h=>h.commandId===commandId);
 if(previous){if(previous.action!==action||previous.reason!==reason||previous.actor!==actor.name)throw Error('COMMAND_REUSED');return readJob(id)!;}
 if(action==='resolve')return jobsDb().transaction(()=>{const current=readJob(id)!;if(current.leaseUntil>Date.now())throw Error('LEASE_ACTIVE');if(!['sending','uncertain','ready_for_operator','withheld'].includes(current.state))throw Error('RECOVERY_NOT_ALLOWED');current.state='reconciled';current.history.push({at:new Date().toISOString(),actor:actor.name,action,reason,commandId});writeJob(current);return current;})();
 await processInbound(j.input,interpreter,{actor:actor.name,reason,commandId});
 return readJob(id)!;
}
