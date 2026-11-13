import {createHmac,randomUUID} from 'node:crypto';
const root=process.env.FIXTURE_ROOT||new URL('../../',import.meta.url).pathname;
const {createOrder,db}=await import(root+'/lib/db.ts');
const {processInbound,reconcileInbound}=await import(root+'/lib/process-inbound.ts');
const {processTelegramUpdate}=await import(root+'/lib/telegram-inbound.ts');
const {createInstagramWebhook}=await import(root+'/lib/instagram-direct.ts');
const channel=process.env.FIXTURE_CHANNEL||'site';
const text='Хочу пісню для мами Олени. Вигаданий спогад про яблуню.';
let sends=0;
const hold=()=>new Promise<any>(()=>{setInterval(()=>{},1000)});
const interpreter=async()=>{if(process.env.FIXTURE_PHASE==='interpreter'){console.log('INTERPRETER_READY');return hold()}return {action:'clarify',reply:'Який спогад для мами найважливіший?',updates:[]}};
const send=async()=>{sends++;if(process.env.FIXTURE_PHASE==='send'){console.log('SEND_READY');await hold()}};
try{
 if(process.env.FIXTURE_MODE==='recover'){
  const {listRecoveryJobs}=await import(root+'/lib/inbound-jobs.ts');const job=listRecoveryJobs()[0];
  const result=await reconcileInbound(job.id,'recover',randomUUID(),'Синтетична перевірка після process crash',{role:'owner',name:'Костя'},interpreter);console.log(JSON.stringify({state:result.state,sends}));
 }else if(channel==='site'){
  const id=createOrder({name:'Синтетична Ярина',recipient:'Не вказано',contact:'qa@example.test',requestId:'11111111-1111-4111-8111-111111111111'});
  const r=await processInbound({orderId:id,channel,eventId:'crash-site',message:text},interpreter);console.log(JSON.stringify({mode:r.mode,sends}));
 }else if(channel==='telegram'){
  const r=await processTelegramUpdate({update_id:8001,message:{chat:{id:9001,type:'private'},text}},send,Date.now(),interpreter);console.log(JSON.stringify({...r,sends}));
 }else{
  const handler=createInstagramWebhook({appSecret:'fixture',verifyToken:'fixture',accountIds:new Set(['qa']),interpreter,send});
  const body=JSON.stringify({object:'instagram',entry:[{id:'qa',messaging:[{sender:{id:'fixture-sender'},recipient:{id:'qa'},message:{mid:'crash-instagram',text}}]}]});
  const r=await handler(new Request('http://fixture.test',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','fixture').update(body).digest('hex')}}));console.log(JSON.stringify({status:r.status,sends}));
 }
}catch(e){console.log(JSON.stringify({error:e instanceof Error?e.message:String(e),sends}));process.exitCode=2}
