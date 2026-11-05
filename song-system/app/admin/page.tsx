import {authorized} from '@/lib/auth';import {listOrders,listMedia} from '@/lib/db';import Admin from './ui';
export const dynamic='force-dynamic';
export default async function Page(){const auth=await authorized();return <Admin initialOrders={auth?listOrders():[]} initialMedia={auth?listMedia():[]} loggedIn={auth}/>}
