import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {db} from '../lib/db';
import {processTelegramUpdate} from '../lib/telegram-inbound';
import {readJob,writeJob,jobId} from '../lib/inbound-jobs';
import {reconcileInbound} from '../lib/process-inbound';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync('/tmp/telegram-fencing-');process.env.SESSION_SECRET='synthetic-only-fencing';
let sequence=1000;
function fixture(){const id=++sequence;return {id,input:{update_id:id,message:{chat:{id,type:'private'},text:'Хочу пісню для мами. Це вигадана історія.'}}}}
function delivery(id:number){return JSON.parse((db().prepare('SELECT body FROM telegram_deliveries WHERE updateId=?').get(id) as {body:string}).body)}
test('RECOVERY-TG-01: owner resolve during first send prevents second send and replay',async()=>{
 const {id,input}=fixture();let release!:()=>void,started!:()=>void;const first=new Promise<void>(r=>started=r);let calls=0;
 const transport=async()=>{calls++;if(calls===1){started();await new Promise<void>(r=>release=r)}};
 const pending=processTelegramUpdate(input,transport);await first;
 assert.ok(delivery(id).outbound.filter((o:any)=>o.state==='pending').length>0,'fixture must contain a second send');
 const key=jobId('telegram',String(id)),job=readJob(key)!;job.leaseUntil=0;writeJob(job);
 await reconcileInbound(key,'resolve',randomUUID(),'QA: звірено вручну після завершення lease',{role:'owner',name:'Костя'});
 release();await pending;
 assert.equal(calls,1,'stale worker must not start the second send after owner reconciliation');
 assert.equal(readJob(key)?.state,'reconciled');
 await processTelegramUpdate(input,transport);assert.equal(calls,1,'replay must not resend');
 assert.equal(db().prepare('SELECT count(*) n FROM payments').get()?.n,0);assert.equal(db().prepare('SELECT count(*) n FROM lyrics_tasks').get()?.n,0);
});
for(const change of ['expired','token','uncertain','withheld'] as const)test('every Telegram send rechecks '+change,async()=>{
 const {id,input}=fixture();let release!:()=>void,started!:()=>void;const first=new Promise<void>(r=>started=r);let calls=0;
 const transport=async()=>{calls++;if(calls===1){started();await new Promise<void>(r=>release=r)}};
 const pending=processTelegramUpdate(input,transport);await first;const key=jobId('telegram',String(id)),job=readJob(key)!;
 if(change==='expired')job.leaseUntil=0;else if(change==='token')job.token=randomUUID();else job.state=change;writeJob(job);
 release();const result=await pending;assert.equal(calls,1);assert.equal(result.needsReview,true);assert.notEqual(readJob(key)?.state,'completed');await processTelegramUpdate(input,transport);assert.equal(calls,1);
});
test('valid active claim still sends the complete batch once',async()=>{const {id,input}=fixture();let calls=0;const transport=async()=>{calls++};await processTelegramUpdate(input,transport);assert.ok(calls>=2);assert.equal(delivery(id).outbound.every((o:any)=>o.state==='sent'),true);assert.equal(readJob(jobId('telegram',String(id)))?.state,'completed');const before=calls;await processTelegramUpdate(input,transport);assert.equal(calls,before)});
