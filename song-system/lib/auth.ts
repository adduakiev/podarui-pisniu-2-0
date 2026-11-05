import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
export function equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
function sign(v:string){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error('Session secret missing');return createHmac('sha256',secret).update(v).digest('hex')}
export function token(){const exp=String(Date.now()+8*3600000);return exp+'.'+sign(exp)}
export async function authorized(){const raw=(await cookies()).get('admin_session')?.value||'';const [exp,sig]=raw.split('.');return !!exp&&Number(exp)>Date.now()&&!!sig&&equal(sig,sign(exp))}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');const host=req.headers.get('host');if(!origin||!host)return false;try{const url=new URL(origin);return url.host===host&&url.protocol===new URL(req.url).protocol}catch{return false}}
