import {randomUUID} from 'node:crypto';
import {db} from './db';
import {dialogueContext,dialogueSnapshot} from './conversation';
import {olenaDialogue} from './olena-dialogue';
import type {Interpreter} from './olena-interpreter';
export type InboundChannel='site'|'telegram'|'instagram';
export type Inbound={orderId:string;channel:InboundChannel;eventId?:string;message?:string;confirm?:boolean;snapshot?:boolean};
// Durable receipt precedes interpretation. No transaction spans an await.
export async function processInbound(input:Inbound,interpreter?:Interpreter){
 if(input.snapshot)return {...dialogueSnapshot(input.orderId),suppressReply:false};
 const database=db();
 database.exec(`CREATE TABLE IF NOT EXISTS dialogue_inbound(channel TEXT NOT NULL,eventId TEXT NOT NULL,orderId TEXT NOT NULL,input TEXT NOT NULL,state TEXT NOT NULL,result TEXT,receivedAt TEXT NOT NULL,PRIMARY KEY(channel,eventId))`);
 const eventId=input.eventId??randomUUID();
 const payload=JSON.stringify({orderId:input.orderId,message:input.message,confirm:!!input.confirm});
 const receipt=database.transaction(()=>{
  const old=database.prepare('SELECT input,state,result FROM dialogue_inbound WHERE channel=? AND eventId=?').get(input.channel,eventId) as {input:string;state:string;result:string}|undefined;
  if(old){if(old.input!==payload)throw Error('INBOUND_ID_REUSED');if(old.state==='processing')throw Error('INBOUND_IN_PROGRESS');if(old.state==='done')return old;}
  if(old)database.prepare("UPDATE dialogue_inbound SET state='processing' WHERE channel=? AND eventId=?").run(input.channel,eventId);
  else database.prepare('INSERT INTO dialogue_inbound VALUES(?,?,?,?,?,?,?)').run(input.channel,eventId,input.orderId,payload,'processing',null,new Date().toISOString());
 })();
 if(receipt){
  const result=JSON.parse(receipt.result) as Awaited<ReturnType<typeof olenaDialogue>>;
  const current=dialogueContext(result.orderId);
  const safe=current.mode==='producer'||current.contactPaused||current.orderId!==result.orderId||current.revision!==result.deliveryRevision?dialogueSnapshot(current.orderId):result;
  return {...safe,suppressReply:true,deliveryRevision:current.revision};
 }
 try{
  const result=await olenaDialogue(input.orderId,input.message,!!input.confirm,interpreter,input.channel+':'+eventId);
  const response={...result,suppressReply:'stale' in result&&!!result.stale,deliveryRevision:result.deliveryRevision};
  database.prepare("UPDATE dialogue_inbound SET state='done',result=? WHERE channel=? AND eventId=?").run(JSON.stringify(response),input.channel,eventId);
  return response;
 }catch(error){database.prepare("UPDATE dialogue_inbound SET state='failed' WHERE channel=? AND eventId=?").run(input.channel,eventId);throw error;}
}
export function deliveryCurrent(orderId:string,revision:number){const c=dialogueContext(orderId);return c.orderId===orderId&&c.revision===revision;}
