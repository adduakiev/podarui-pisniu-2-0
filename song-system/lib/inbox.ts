import {db,listOrders} from './db';
import {crmTables,orderContacts,deliveryEventId,type TimelineEvent} from './crm-records';
type InboxEvent=Omit<TimelineEvent,'at'|'updatedAt'>&{at:string|null;updatedAt:string|null;jobState?:string};
export function readInbox(orderId:string){const d=db();const order=listOrders().find(o=>o.id===orderId);if(!order)throw Error('NOT_FOUND');crmTables(d);
 const exists=(name:string)=>!!d.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name);
 const events:InboxEvent[]=(d.prepare('SELECT body FROM crm_timeline WHERE orderId=? ORDER BY rowid').all(orderId) as {body:string}[]).map(r=>JSON.parse(r.body));
 const add=(e:InboxEvent)=>{if(!events.some(old=>old.id===e.id))events.push(e)};
 if(exists('dialogue_inbound'))for(const row of d.prepare('SELECT * FROM dialogue_inbound WHERE orderId=?').all(orderId) as any[]){const input=JSON.parse(row.input);if(input.message)add({id:JSON.stringify(['inbound',row.channel,row.eventId,orderId]),orderId,channel:row.channel,direction:'inbound',text:input.message,at:row.receivedAt,updatedAt:row.receivedAt,status:'received'});}
 if(exists('telegram_deliveries'))for(const row of d.prepare('SELECT * FROM telegram_deliveries').all() as any[]){const body=JSON.parse(row.body);for(const [index,item] of body.outbound.entries())if(item.orderId===orderId&&item.method==='sendMessage')add({id:deliveryEventId('telegram',String(row.updateId),index),orderId,channel:'telegram',direction:'outbound',text:String(item.payload.text),status:item.state,at:null,updatedAt:null,jobId:JSON.stringify(['telegram',String(row.updateId)])});}
 if(exists('instagram_inbound')&&exists('dialogue_inbound'))for(const row of d.prepare('SELECT * FROM instagram_inbound WHERE reply IS NOT NULL').all() as any[]){const eventId=JSON.stringify([row.accountId,row.inboundId,'message']);const receipt=d.prepare("SELECT result FROM dialogue_inbound WHERE channel='instagram' AND eventId=?").get(eventId) as {result:string}|undefined;if(!receipt?.result||JSON.parse(receipt.result).orderId!==orderId)continue;add({id:deliveryEventId('instagram',eventId),orderId,channel:'instagram',direction:'outbound',text:row.reply,status:row.sentAt?'sent':'unknown',at:row.sentAt||null,updatedAt:row.sentAt||null,jobId:JSON.stringify(['instagram',eventId])});}
 for(const e of events)if(e.jobId&&exists('inbound_jobs')){const row=d.prepare('SELECT body FROM inbound_jobs WHERE id=?').get(e.jobId) as {body:string}|undefined;if(row)e.jobState=JSON.parse(row.body).state;}
 events.sort((a,b)=>(a.at??'').localeCompare(b.at??''));
 const row=exists('conversations')?d.prepare('SELECT body FROM conversations WHERE orderId=?').get(orderId) as {body:string}|undefined:undefined;
 const conversation:{role:string;text:string}[]=row?JSON.parse(row.body).messages:[];
 return {order,contacts:orderContacts(d,order),events,conversation:conversation.map((m,index)=>({id:index,role:m.role,text:m.text,channel:null,at:null}))};
}
