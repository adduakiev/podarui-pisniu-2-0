// Offline fixture only. Start the app with empty env, LOCAL_ONLY=1 and a fresh DATA_DIR.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.QA_BASE||'http://127.0.0.1:3118';
const evidence=process.env.QA_EVIDENCE||'/workspace/work/payment-terms-evidence';
const result={viewport:{width:390,height:844},scenarios:[],externalBlocked:[],pageErrors:[]};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
async function context(){const c=await browser.newContext({viewport:result.viewport,isMobile:true,hasTouch:true});await c.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();result.externalBlocked.push(r.request().url());return r.abort()});c.setDefaultTimeout(15000);c.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));return c}
const ac=await context(),admin=await ac.newPage();
try{
 await admin.goto(base+'/admin');await admin.locator('input[name=password]').fill('synthetic-only-password');await admin.getByRole('button',{name:'Увійти →',exact:true}).click();await admin.getByRole('button',{name:'Вийти',exact:true}).waitFor();
 for(const plan of ['military','story']){
  const cc=await context(),customer=await cc.newPage();await customer.goto(base);
  const opening='Хочу пісню для мами Олени. Це вигадана історія: разом садили яблуню. Хочу подякувати за турботу.';
  await customer.getByLabel('З чого почнемо?',{exact:true}).fill(opening);await customer.getByText('Додати контакт або обрати формат',{exact:true}).click();await customer.getByLabel('Контакт (необов’язково)',{exact:true}).fill('synthetic-'+plan+'@example.test');await customer.locator('.public-order-form select').selectOption(plan);await customer.locator('.public-order-form input[type=checkbox]').check();const created=customer.waitForResponse(r=>r.url()===base+'/api/orders'&&r.request().method()==='POST');await customer.getByRole('button',{name:'Почати розмову',exact:true}).click();const id=(await(await created).json()).id;assert.ok(id);await customer.getByLabel('Ваша відповідь',{exact:true}).waitFor();assert.equal(await customer.getByRole('link',{name:'Перейти до оплати ↗',exact:true}).count(),0);
  async function open(){await admin.reload();await admin.locator('.order-row').first().click();await admin.locator('textarea[name=notes]').waitFor()}
  async function save(){const response=admin.waitForResponse(r=>r.url()===base+'/api/orders'&&r.request().method()==='PATCH');await admin.getByRole('button',{name:'Зберегти зміни',exact:true}).click();const r=await response;assert.equal(r.status(),200);const data=await r.json(),payload=r.request().postDataJSON();await admin.waitForLoadState('networkidle');return {data,payload}}
  await open();await admin.locator('textarea[name=notes]').fill('Погоджений синтетичний бриф: мамі Олені, подяка, спогад про яблуню.');await admin.locator('input[name=completeBrief]').check();const brief=await save();assert.equal(brief.data.paid,0);assert.equal(brief.data.lyricsTask,undefined);const due=brief.data.dueAt;
  await open();await admin.locator('input[name=confirmTerms]').check();
  if(plan==='military'){await admin.locator('select[name=termsMode]').selectOption('owner_deferred');await admin.locator('input[name=deferPaymentReason]').fill('Власник дозволяє військовому оплатити після надсилання пісні');}
  else{await admin.locator('input[name=paymentAmount]').fill('1000');await admin.locator('input[name=paymentNote]').fill('Вигадана QA оплата, кошти не надходили');assert.equal(await admin.locator('input[name=paymentAmount]').inputValue(),'1000');}
  const started=await save();assert.equal(started.data.status,'Текст');assert.equal(started.data.paid,plan==='military'?0:100000);assert.equal(started.data.dueAt,due);assert.ok(started.data.lyricsTask.id);assert.equal(started.data.opening,opening);
  const replay=await admin.evaluate(async payload=>{const r=await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});return {status:r.status,data:await r.json()}},started.payload);assert.equal(replay.status,200);assert.equal(replay.data.lyricsTask.id,started.data.lyricsTask.id);assert.equal(replay.data.paid,started.data.paid);
  await open();assert.equal(await admin.getByTestId('lyrics-task').count(),1);assert.equal(await admin.locator('input[name=paymentAmount]').inputValue(),'');await admin.screenshot({path:evidence+'/mobile-'+plan+'.png',fullPage:true});
  const unauthorized=await customer.evaluate(async payload=>(await fetch('/api/orders',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,started.payload);assert.equal(unauthorized,403);
  await customer.reload();await customer.getByLabel('Ваша відповідь',{exact:true}).waitFor();assert.ok((await customer.locator('.chat-messages').innerText()).includes(opening));
  result.scenarios.push({plan,id,openingPreserved:true,paid:started.data.paid,total:started.data.amount,terms:started.data.payment_terms,lyricsTask:started.data.lyricsTask.id,duplicateSameTask:true,unauthenticatedStatus:unauthorized,deadlinePreserved:true,reload:true});await cc.close();
 }
 assert.deepEqual(result.pageErrors,[]);result.ok=true;
}catch(e){result.ok=false;result.error=String(e);await admin.screenshot({path:evidence+'/mobile-error.png',fullPage:true});throw e}
finally{fs.writeFileSync(evidence+'/mobile-results.json',JSON.stringify(result,null,2));await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
