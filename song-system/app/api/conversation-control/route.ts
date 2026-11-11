import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authorized,sameOrigin} from '@/lib/auth';
import {resumeConversation} from '@/lib/conversation';
export async function POST(req:Request){if(!sameOrigin(req)||!await authorized())return NextResponse.json({error:'Потрібен вхід'},{status:403});try{const {id}=z.object({id:z.string().uuid()}).parse(await req.json());return NextResponse.json(resumeConversation(id),{headers:{'Cache-Control':'no-store'}})}catch(error){if(error instanceof Error&&error.message==='CONTACT_REACTIVATION_REQUIRES_CONSENT')return NextResponse.json({error:'Автоматичні повідомлення призупинено на прохання клієнта. Поновлення потребує окремо погодженої згоди.'},{status:409});return NextResponse.json({error:'Не вдалося відновити розмову'},{status:400})}}
