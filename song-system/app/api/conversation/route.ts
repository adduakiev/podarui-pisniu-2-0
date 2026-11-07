import {NextResponse} from 'next/server';
import {z} from 'zod';
import {sameOrigin,equal} from '@/lib/auth';
import {chatToken,saveTestFeedback} from '@/lib/conversation';
import {olenaDialogue} from '@/lib/olena-dialogue';
export async function POST(req:Request){if(!sameOrigin(req))return NextResponse.json({error:'Доступ заборонено'},{status:403});try{const p=z.object({id:z.string().uuid(),token:z.string().length(64),message:z.string().trim().min(1).max(15000).optional(),confirm:z.boolean().optional()}).parse(await req.json());if(!equal(p.token,chatToken(p.id)))return NextResponse.json({error:'Доступ заборонено'},{status:403});return NextResponse.json(await olenaDialogue(p.id,p.message,p.confirm),{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Не вдалося зберегти повідомлення. Спробуйте ще раз.'},{status:400})}}

export async function PATCH(req:Request){
 if(process.env.LOCAL_ONLY!=='1'||!sameOrigin(req))return NextResponse.json({error:'Доступ заборонено'},{status:403});
 try{
  const p=z.object({id:z.string().uuid(),token:z.string().length(64),index:z.number().int().nonnegative(),replacement:z.string().trim().min(1).max(3000),reason:z.string().trim().max(1000)}).parse(await req.json());
  if(!equal(p.token,chatToken(p.id)))return NextResponse.json({error:'Доступ заборонено'},{status:403});
  return NextResponse.json(saveTestFeedback(p.id,p.index,{replacement:p.replacement,reason:p.reason}),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Не вдалося зберегти оцінку'},{status:400})}
}
