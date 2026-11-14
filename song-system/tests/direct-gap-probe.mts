// Expected open gap, separate from the passing regression suite. Exit 1 documents failure.
import assert from 'node:assert/strict';import {mkdtempSync} from 'node:fs';import {createHmac} from 'node:crypto';
import {createInstagramWebhook} from '../lib/instagram-direct';import {listOrders} from '../lib/db';
process.env.LOCAL_ONLY='1';process.env.DATA_DIR=mkdtempSync('/tmp/direct-gap-');process.env.SESSION_SECRET='synthetic-gap-session-secret-for-fixture';
const text='Хочу пісню для мами\nemail: first@example.test; телефон: +380501112233';
const handler=createInstagramWebhook({appSecret:'fixture',verifyToken:'fixture',accountIds:new Set(['fixture']),send:async()=>{},interpreter:async c=>({action:'summarize',reply:'Уточнімо задум.',updates:[{field:'recipient',value:'мама',evidence:c.message,correction:false}]})});
const body=JSON.stringify({object:'instagram',entry:[{id:'fixture',messaging:[{sender:{id:'synthetic'},recipient:{id:'fixture'},message:{mid:'synthetic-opening',text}}]}]});
assert.equal((await handler(new Request('http://fixture.test',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+createHmac('sha256','fixture').update(body).digest('hex')}}))).status,200);
const o=listOrders()[0];console.log(JSON.stringify({probe:'multiline recipient plus contacts opening',openingPreserved:o.opening===text,recipient:o.recipient,contacts:o.contacts?.filter(c=>c.type==='email'||c.type==='phone').length,expectedRecipient:'мама',verdict:o.recipient==='мама'?'PASS':'FAIL',liveModel:false}));
assert.equal(o.recipient,'мама','MULTILINE_OPENING_RECIPIENT_GAP');
