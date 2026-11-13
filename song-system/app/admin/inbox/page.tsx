import {authorized} from '@/lib/auth';
import Inbox from './ui';
export const dynamic='force-dynamic';
export default async function Page(){if(!await authorized())return <main><a href="/admin">Увійти до CRM</a></main>;return <Inbox/>}
