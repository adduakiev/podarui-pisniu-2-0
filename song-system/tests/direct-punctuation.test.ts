import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import {supportedFactUpdate} from '../lib/olena-fact-evidence';
import {createInstagramWebhook} from '../lib/instagram-direct';
import {db,listOrders} from '../lib/db';
import {dialogueContext} from '../lib/conversation';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync('/tmp/direct-punctuation-');process.env.SESSION_SECRET='synthetic-punctuation-secret';
const check=(message:string,value='мама',correction=false)=>supportedFactUpdate({field:'recipient',value,evidence:message,correction},message);
const contactLines=['email: first@example.test; телефон: +380501112233','телефон: +380501112233; email: first@example.test'];
for(const newline of ['\n','\r\n'])for(const contacts of contactLines)for(const suffix of ['',';',';  ',';;'])test('recipient with '+JSON.stringify({newline,contacts,suffix}),()=>{const text='Хочу пісню для мами'+newline+contacts+suffix;assert.equal(check(text),true)});
test('mask preserves negation, mixed prose, ambiguous contacts and unrelated names',()=>{
 for(const text of ['Не\nemail: first@example.test;\nдля мами','Хочу пісню не\nтелефон: +380501112233;\nдля мами','Мама любить музику\nemail: first@example.test;','email: mama@example.test;\nInstagram: @mama_test;','Хочу пісню для\nemail: mama@example.test; contactname: мама','Хочу пісню для мами\nemail: first@example.test; можливо бабусі'])assert.equal(check(text),false,text);
 assert.equal(check('Хочу пісню для бабусі\nemail: mama@example.test;','мама'),false);
 assert.equal(check('Хочу пісню для бабусі\nemail: mama@example.test;','бабуся'),true);
});
function fixture(){const sender=randomUUID();let calls=0,sends=0;const handler=createInstagramWebhook({appSecret:'fixture',verifyToken:'fixture',accountIds:new Set(['fixture']),send:async()=>{sends++},interpreter:async c=>{calls++;return {action:'summarize',reply:'Уточнімо задум.',updates:[{field:'recipient',value:c.message.includes('бабусі')?'бабуся':'мама',evidence:c.message,correction:c.message.startsWith('Ні,')}]}}});return {get calls(){return calls},get sends(){return sends},id(){return (db().prepare('SELECT orderId FROM instagram_threads WHERE senderId=?').get(sender) as any).orderId},async send(text:string,mid=randomUUID(),escaped=false){let body=JSON.stringify({object:'instagram',entry:[{id:'fixture',messaging:[{sender:{id:sender},recipient:{id:'fixture'},message:{mid,text}}]}]});if(escaped)body=body.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));const response=await handler(new Request('http://fixture',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','fixture').update(Buffer.from(body,'utf8')).digest('hex')}}));assert.equal(response.status,200)}}}
for(const escaped of [false,true])test('signed opening exact bytes, evidence, two contacts, retry and correction '+escaped,async()=>{
 const f=fixture(),text='Хочу пісню для мами\nemail: first@example.test; телефон: +380501112233;',mid=randomUUID();await f.send(text,mid,escaped);const id=f.id();const order=()=>listOrders().find(o=>o.id===id)!;
 assert.equal(order().recipient,'мама','TRAILING_SEMICOLON_RECIPIENT');assert.equal(order().opening,text);assert.equal(Buffer.from(order().opening!).equals(Buffer.from(text)),true);
 const state=()=>JSON.parse((db().prepare('SELECT body FROM conversations WHERE orderId=?').get(id) as any).body);const fact=state().facts.recipient;assert.equal(fact.source,'message');assert.equal(state().messages[fact.source_message_id].text,text);
 const contacts=order().contacts!.filter(c=>['email','phone'].includes(c.type));assert.equal(contacts.length,2);assert.ok(contacts.every(c=>c.provenance.length===1&&c.provenance[0].channel==='instagram'&&!c.verified));const before={calls:f.calls,sends:f.sends};await f.send(text,mid,escaped);assert.deepEqual({calls:f.calls,sends:f.sends},before);assert.equal(state().messages.filter((m:any)=>m.role==='user'&&m.text===text).length,1);assert.equal(order().contacts!.filter(c=>['email','phone'].includes(c.type)).length,2);
 await f.send('Ні, для бабусі\nemail: first@example.test;');assert.equal(order().recipient,'бабуся');assert.equal(order().opening,text);assert.ok(state().factHistory.recipient.some((p:any)=>p.value==='мама'));
 await f.send('Ні, для мами\nтелефон: +380501112233;');assert.equal(order().recipient,'мама');assert.equal(order().paid,0);
});
test('producer and stop guards still bypass interpretation of contact-rich opening',async()=>{for(const control of ['Покличте менеджера','Не пишіть мені']){const f=fixture();await f.send('Хочу пісню для мами\nemail: first@example.test;');await f.send(control);const calls=f.calls,sends=f.sends;await f.send('Хочу пісню для бабусі\nemail: second@example.test; телефон: +380501112233;');assert.equal(f.calls,calls);assert.equal(f.sends,sends);assert.equal(listOrders().find(o=>o.id===f.id())?.recipient,'мама');assert.equal(dialogueContext(f.id()).mode,'producer')}});
