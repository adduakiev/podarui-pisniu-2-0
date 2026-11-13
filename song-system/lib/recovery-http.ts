import {z} from 'zod';
import {listRecoveryJobs} from './inbound-jobs';
import {reconcileInbound} from './process-inbound';
const command=z.object({id:z.string().min(1).max(1000),action:z.enum(['recover','resolve']),commandId:z.string().uuid(),reason:z.string().trim().min(3).max(2000)});
export function recoveryHandler(auth:()=>Promise<boolean>,origin:(request:Request)=>boolean){return async(request:Request)=>{
 if(!await auth()||(request.method!=='GET'&&!origin(request)))return Response.json({error:'Доступ заборонено'},{status:403});
 if(request.method==='GET')return Response.json(listRecoveryJobs(),{headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return new Response(null,{status:405});
 try{const p=command.parse(await request.json());const {token,...job}=await reconcileInbound(p.id,p.action,p.commandId,p.reason,{role:'owner',name:'Костя'});return Response.json(job,{headers:{'Cache-Control':'no-store'}})}
 catch(error){const code=error instanceof Error?error.message:'RECOVERY_FAILED';return Response.json({error:code},{status:['LEASE_ACTIVE','RECOVERY_NOT_ALLOWED','COMMAND_REUSED','COMMAND_ALREADY_APPLIED','CLAIM_LOST'].includes(code)?409:400})}
};}
