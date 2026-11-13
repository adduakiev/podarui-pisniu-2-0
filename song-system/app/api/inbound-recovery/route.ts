import {authorized,sameOrigin} from '@/lib/auth';
import {recoveryHandler} from '@/lib/recovery-http';
export const runtime='nodejs';
export const GET=recoveryHandler(authorized,sameOrigin);
export const POST=GET;
