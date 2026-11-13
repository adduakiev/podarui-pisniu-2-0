import {authorized,sameOrigin} from '@/lib/auth';
import {conversationControlHandler} from '@/lib/inbox-http';
export const POST=conversationControlHandler(authorized,sameOrigin);
