// Synthetic local fixtures only; adapters receive fake transport functions.
import {createHmac} from 'node:crypto';
import {telegramLink,redeemTelegramLink} from '../../lib/telegram-links';
import {processTelegramUpdate} from '../../lib/telegram-inbound';
import {createInstagramWebhook} from '../../lib/instagram-direct';
import {db} from '../../lib/db';
const id=process.env.QA_ORDER;
if(!id||process.env.LOCAL_ONLY!=='1'||!process.env.DATA_DIR)throw Error('Isolated fixture required');
redeemTelegramLink(telegramLink(id).code,'881');
await processTelegramUpdate({update_id:881,message:{chat:{id:881,type:'private'},text:'Telegram: @synthetic_inbox'}},async()=>{throw Error('SYNTHETIC_UNCERTAIN')});
const handler=createInstagramWebhook({appSecret:'fixture',verifyToken:'fixture',accountIds:new Set(['fixture-account']),send:async()=>{}});
const body=JSON.stringify({object:'instagram',entry:[{id:'fixture-account',messaging:[{sender:{id:'fixture-sender'},recipient:{id:'fixture-account'},message:{mid:'mobile-direct',text:'Email: direct@example.test'}}]}]});
const response=await handler(new Request('http://fixture',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','fixture').update(body).digest('hex')}}));
if(response.status!==200)throw Error('Fixture rejected');
console.log(JSON.stringify({directId:(db().prepare("SELECT orderId FROM instagram_threads WHERE senderId='fixture-sender'").get() as {orderId:string}).orderId}));
