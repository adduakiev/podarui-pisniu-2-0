import {z} from 'zod';import {equal,sameOrigin} from '@/lib/auth';import {chatToken} from '@/lib/conversation';import {telegramBindingStatus,decideTelegramBinding} from '@/lib/telegram-approval';
export async function POST(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Доступ заборонено'},{status:403});
 try{const p=z.object({id:z.string().uuid(),token:z.string().length(64),action:z.enum(['status','approve','reject','cancel']),pendingId:z.string().uuid().optional()}).parse(await req.json());
  if(!equal(p.token,chatToken(p.id)))return Response.json({error:'Доступ заборонено'},{status:403});
  if(p.action!=='status'){if(!p.pendingId)return Response.json({error:'Оберіть запит'},{status:400});decideTelegramBinding(p.id,p.pendingId,p.action);}
  return Response.json(telegramBindingStatus(p.id),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Запит недоступний або вже змінений. Оновіть стан підключення.'},{status:409})}
}
