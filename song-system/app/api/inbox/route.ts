import {authorized} from '@/lib/auth';
import {inboxHandler} from '@/lib/inbox-http';
export const GET=inboxHandler(authorized);
