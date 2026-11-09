const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {DatabaseSync}=require('node:sqlite');const fs=require('node:fs');const assert=require('node:assert/strict');
const pathModule=require('node:path');
const base=process.env.BASE_URL||'http://127.0.0.1:3110';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local fixture only');
assert.ok(process.env.DATA_DIR&&process.env.ADMIN_PASSWORD,'Use isolated DATA_DIR and fixture ADMIN_PASSWORD');
const output=process.env.QA_OUTPUT||'/tmp/landing-intent';fs.mkdirSync(output,{recursive:true});
const results=[];
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
async function scenario(name,path,opening,corrections){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});context.setDefaultTimeout(15000);
 const blocked=[],errors=[];await context.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();blocked.push(r.request().url());return r.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const loaded=await page.goto(base+path,{waitUntil:'networkidle'});assert.equal(loaded.status(),200);
 const title=await page.title(),h1=await page.locator('h1').innerText();
 const initialOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(name.endsWith('default'))await page.screenshot({path:pathModule.join(output,name+'-landing.png'),fullPage:true});
 await page.getByLabel('З чого почнемо?',{exact:true}).fill(opening);await page.locator('input[type=checkbox]').check();
 const intake=page.waitForResponse(r=>r.url()===base+'/api/orders'&&r.request().method()==='POST');await page.getByRole('button',{name:'Почати розмову',exact:true}).click();
 const response=await intake;assert.equal(response.status(),201);const session=await response.json();const payload=response.request().postDataJSON();
 await page.getByLabel('Ваша відповідь',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
 const database=new DatabaseSync(pathModule.join(process.env.DATA_DIR,'system.sqlite'),{readOnly:true});
 const snapshot=()=>{const order=JSON.parse(database.prepare('SELECT body FROM orders WHERE id=?').get(session.id).body);const state=JSON.parse(database.prepare('SELECT body FROM conversations WHERE orderId=?').get(session.id).body);return {recipient:order.recipient,occasion:order.occasion,answerOccasion:state.answers.occasion,source:order.source,source_page:order.source_page,landing_defaults:order.landing_defaults,facts:state.facts,factHistory:state.factHistory,paid:order.paid,paymentLink:order.paymentLink,opening:order.opening,reply:state.messages.at(-1)?.text,orderKeys:Object.keys(order),openingCount:state.messages.filter(m=>m.role==='user'&&m.text===opening).length,notes:order.notes,answers:state.answers}};
 const initial=snapshot();assert.equal(initial.source_page,path);assert.equal(payload.source_page,path);
 const expected={
  'mother-default':['мама',''],
  'birthday-default':['мами','День народження'],
  'mother-explicit':['бабусі',''],
  'birthday-explicit':['мамі','на річницю весілля'],
 }[name];assert.deepEqual([initial.recipient,initial.occasion],expected);
 assert.equal(initial.opening,opening);assert.equal(initial.openingCount,1);
 const turns=[];
 for(const message of corrections){await page.getByLabel('Ваша відповідь',{exact:true}).fill(message);const pending=page.waitForResponse(r=>r.url()===base+'/api/conversation'&&r.request().postDataJSON()?.message===message);await page.getByRole('button',{name:'Надіслати відповідь ↗',exact:true}).click();assert.equal((await pending).status(),200);await page.waitForLoadState('networkidle');const turn=snapshot();
 if(message==='Не для мами, а для бабусі')assert.equal(turn.recipient,'бабусі');
 if(message==='Не на день народження, а на річницю весілля')assert.equal(turn.occasion,'річницю весілля');
 if(message==='Змінити привід: річниця весілля')assert.equal(turn.occasion,'річниця весілля');
 turns.push({message,...turn})}
 await page.reload({waitUntil:'networkidle'});await page.getByLabel('Ваша відповідь',{exact:true}).waitFor();const afterReload=snapshot();
 assert.equal(afterReload.openingCount,1);assert.equal(afterReload.source_page,path);
 assert.deepEqual(afterReload,turns.length?Object.fromEntries(Object.entries(turns.at(-1)).filter(([key])=>key!=='message')):initial);
 assert.equal(afterReload.paid,0);assert.equal(afterReload.paymentLink,'');
 for(const snapshot of [initial,...turns])assert.doesNotMatch(snapshot.reply,/оплат|передоплат|реквізит/iu);
 const factKey=path==='/pisnia-dlia-mamy'?'recipient':'occasion';
 const history=afterReload.factHistory?.[factKey]||[afterReload.facts[factKey]];
 assert.equal(history[0].status,'unconfirmed');assert.equal(history[0].source_page,path);
 const transcript=await page.locator('.chat-messages').innerText();assert.ok(transcript.includes(opening));for(const m of corrections)assert.ok(transcript.includes(m));
 const admin=await context.newPage();await admin.goto(base+'/admin',{waitUntil:'networkidle'});await admin.getByLabel('Пароль',{exact:true}).fill(process.env.ADMIN_PASSWORD);await admin.getByRole('button',{name:'Увійти →',exact:true}).click();await admin.locator('.order-row').first().waitFor();await admin.locator('.order-row').first().click();await admin.locator('textarea[name=notes]').waitFor();
 const crmText=await admin.locator('.order-detail').innerText();const crmNotes=await admin.locator('textarea[name=notes]').inputValue();assert.ok(crmNotes.includes(opening));assert.ok(crmText.includes(afterReload.recipient));assert.ok(crmText.includes(path));assert.equal(await admin.locator('.order-detail').getByRole('link',{name:path,exact:true}).count(),1);
 const attribution={payloadKeys:Object.keys(payload),source:afterReload.source,pagePathStored:afterReload.source_page===path,hasSourcePageField:afterReload.orderKeys.some(k=>/landing|source.?page|referr|utm/i.test(k))};
 results.push({name,path,title,h1,initialOverflow,payload,initial,turns,afterReload,crm:{openingVisible:true,recipientVisible:true,occasionVisible:crmText.includes(afterReload.occasion),overflow:await admin.evaluate(()=>document.documentElement.scrollWidth>innerWidth)},attribution,blocked,errors});
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 await admin.screenshot({path:pathModule.join(output,name+'-crm.png'),fullPage:true});database.close();await context.close();
 console.log(JSON.stringify({name,recipient:initial.recipient,occasion:initial.occasion,turns:turns.map(t=>({message:t.message,recipient:t.recipient,occasion:t.occasion})),attribution}));
}
try{
 await scenario('mother-default','/pisnia-dlia-mamy','Привіт',['Не для мами, а для бабусі']);
 await scenario('birthday-default','/pisnia-na-den-narodzhennia','Хочу пісню для мами',['Не на день народження, а на річницю весілля','Змінити привід: річниця весілля']);
 await scenario('mother-explicit','/pisnia-dlia-mamy','Хочу пісню для бабусі',[]);
 await scenario('birthday-explicit','/pisnia-na-den-narodzhennia','Хочу пісню мамі на річницю весілля',[]);
}finally{fs.writeFileSync(pathModule.join(output,'results.json'),JSON.stringify(results,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
