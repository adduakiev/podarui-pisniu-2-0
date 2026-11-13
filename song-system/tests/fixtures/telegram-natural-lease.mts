// Optional slow offline proof: waits for the real persisted 60-second lease.
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {processTelegramUpdate} from '../../lib/telegram-inbound';
import {readJob,jobId} from '../../lib/inbound-jobs';
import {reconcileInbound} from '../../lib/process-inbound';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync('/tmp/tg-natural-lease-');process.env.SESSION_SECRET='synthetic-only-fencing';
let release!:()=>void,started!:()=>void,calls=0;
const first=new Promise<void>(r=>started=r);
const input={update_id:60001,message:{chat:{id:60001,type:'private'},text:'Хочу пісню для мами. Вигаданий сценарій.'}};
const transport=async()=>{calls++;if(calls===1){started();await new Promise<void>(r=>release=r)}};
const at=Date.now();const pending=processTelegramUpdate(input,transport);await first;
const id=jobId('telegram','60001'),job=readJob(id)!;
await new Promise(r=>setTimeout(r,Math.max(0,job.leaseUntil-Date.now())+100));
await reconcileInbound(id,'resolve',randomUUID(),'QA: природне завершення lease; ручна звірка',{role:'owner',name:'Костя'});
release();await pending;assert.equal(calls,1);await processTelegramUpdate(input,transport);assert.equal(calls,1);assert.equal(readJob(id)?.state,'reconciled');
console.log(JSON.stringify({ok:true,elapsedMs:Date.now()-at,naturalLeaseExpiry:true,leaseModified:false,transport:'fake',calls,state:readJob(id)?.state}));
