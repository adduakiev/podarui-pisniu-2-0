import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import {contactValue,type ContactType} from './contact-values';
export type Origin={source_page?:string;source:'form'|'message'|'legacy';channel:string;eventId:string;evidence:string;at:string|null;confirmed:boolean};
export type Contact={type:ContactType|'other';value:string;confirmed:boolean;verified:false;provenance:Origin[]};
export type TimelineEvent={id:string;orderId:string;channel:string;direction:'inbound'|'outbound';text:string;at:string;updatedAt:string;status:string;jobId?:string};
export function offeredContacts(text:string){const found:{type:ContactType;value:string;evidence:string}[]=[];
 for(const clause of text.split(/[;\n,]/)){const part=clause.trim();if(/мабуть|можливо|здається|не впевнен|неточно|не знаю/iu.test(part))continue;
  const labelled=part.match(/^(?:(?:мій|моя|мої)\s+)?(email|e-mail|пошта|телефон|телефони|whatsapp|telegram|телеграм|instagram|інстаграм)\s*:\s*(.+)$/iu);
  const type:ContactType|undefined=labelled?(/email|mail|пошта/iu.test(labelled[1])?'email':/телефон|whatsapp/iu.test(labelled[1])?'phone':/telegram|телеграм/iu.test(labelled[1])?'telegram':'instagram'):contactValue('email',part)?'email':contactValue('phone',part)?'phone':undefined;
  if(!type)continue;const raw=labelled?labelled[2]:part;
  // Only whole values in a structured clause; never mine IDs/names or prose for contacts.
  const values=type==='email'?raw.split(/\s+(?:і|та|and)\s+|\s+/iu):[raw];
  if(values.some(value=>!contactValue(type,value)))continue;
  for(const value of values){const normalized=contactValue(type,value);if(normalized)found.push({type,value:normalized,evidence:part});}
 }
 return found;
}
export function crmTables(d:DatabaseSync){d.exec(`CREATE TABLE IF NOT EXISTS order_contacts(orderId TEXT NOT NULL,type TEXT NOT NULL,normalized TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(orderId,type,normalized));CREATE TABLE IF NOT EXISTS crm_timeline(id TEXT PRIMARY KEY,orderId TEXT NOT NULL,body TEXT NOT NULL);`);}
export function addContact(d:DatabaseSync,orderId:string,type:Contact['type'],value:string,origin:Origin){crmTables(d);const key=type==='phone'||type==='other'?value:value.toLowerCase();const row=d.prepare('SELECT body FROM order_contacts WHERE orderId=? AND type=? AND normalized=?').get(orderId,type,key) as {body:string}|undefined;const contact:Contact=row?JSON.parse(row.body):{type,value,confirmed:false,verified:false,provenance:[]};
 if(!contact.provenance.some(p=>p.eventId===origin.eventId&&p.source===origin.source&&p.channel===origin.channel&&p.evidence===origin.evidence))contact.provenance.push(origin);
 contact.confirmed=contact.provenance.some(p=>p.confirmed);d.prepare('INSERT OR REPLACE INTO order_contacts VALUES(?,?,?,?)').run(orderId,type,key,JSON.stringify(contact));}
export function timeline(d:DatabaseSync,event:Omit<TimelineEvent,'at'|'updatedAt'>&{at?:string}){crmTables(d);const row=d.prepare('SELECT body FROM crm_timeline WHERE id=?').get(event.id) as {body:string}|undefined;const old:TimelineEvent|undefined=row?JSON.parse(row.body):undefined;if(old&&(old.orderId!==event.orderId||old.text!==event.text))throw Error('TIMELINE_EVENT_REUSED');const at=event.at??new Date().toISOString();const next={...event,at:old?.at??at,updatedAt:old?.status===event.status?old.updatedAt:at};d.prepare('INSERT OR REPLACE INTO crm_timeline VALUES(?,?,?)').run(event.id,event.orderId,JSON.stringify(next));}
export function captureInbound(d:DatabaseSync,input:{orderId:string;channel:string;eventId:string;message?:string}){if(!input.message)return;const at=new Date().toISOString(),id=JSON.stringify(['inbound',input.channel,input.eventId,input.orderId]);timeline(d,{id,orderId:input.orderId,channel:input.channel,direction:'inbound',text:input.message,status:'received',at});for(const c of offeredContacts(input.message))addContact(d,input.orderId,c.type,c.value,{source:'message',channel:input.channel,eventId:input.eventId,evidence:c.evidence,at,confirmed:true});}
export function captureForm(d:DatabaseSync,o:{id:string;contact:string;channel:string;createdAt:string;source?:string;opening?:string;requestId:string;source_page?:string},supplied:{type:ContactType;value:string}[]=[]){const source=o.source??'site';const origin:Origin={source_page:o.source_page,source:'form',channel:source,eventId:o.requestId,evidence:o.contact,at:o.createdAt,confirmed:true};
 if(source==='site'&&o.contact!=='Чат сайту'){const parsed=offeredContacts(o.contact);if(parsed.length)for(const c of parsed)addContact(d,o.id,c.type,c.value,{...origin,evidence:c.evidence});else addContact(d,o.id,'other',o.contact,{...origin,confirmed:false});}
 for(const c of supplied)addContact(d,o.id,c.type,contactValue(c.type,c.value)!,{...origin,evidence:c.value});
 if(source==='site'&&o.opening){const eventId='opening:'+o.requestId;timeline(d,{id:JSON.stringify(['inbound','site',eventId,o.id]),orderId:o.id,channel:'site',direction:'inbound',text:o.opening,status:'received',at:o.createdAt});for(const c of offeredContacts(o.opening))addContact(d,o.id,c.type,c.value,{...origin,eventId,evidence:c.evidence});}}
export function orderContacts(d:DatabaseSync,o:{id:string;contact:string;channel:string;createdAt?:string;source?:string}):Contact[]{crmTables(d);let rows=d.prepare('SELECT body FROM order_contacts WHERE orderId=? ORDER BY rowid').all(o.id) as {body:string}[];
 if(!rows.some(r=>(JSON.parse(r.body) as Contact).provenance.some(p=>p.source==='form'))&&o.contact&&o.contact!=='Чат сайту'){const parsed=offeredContacts(o.contact);const origin:Origin={source:'legacy',channel:o.source??'unknown',eventId:'legacy:'+o.id,evidence:o.contact,at:o.createdAt??null,confirmed:false};if(parsed.length)for(const c of parsed)addContact(d,o.id,c.type,c.value,origin);else addContact(d,o.id,'other',o.contact,origin);rows=d.prepare('SELECT body FROM order_contacts WHERE orderId=? ORDER BY rowid').all(o.id) as {body:string}[];}
 return rows.map(r=>JSON.parse(r.body));}
export const deliveryEventId=(channel:string,eventId:string,index=0)=>createHash('sha256').update(JSON.stringify(['outbound',channel,eventId,index])).digest('hex');
