// Run against an isolated LOCAL_ONLY server. See payment-refresh.md.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3105';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local QA only');
assert.ok(process.env.QA_ADMIN_PASSWORD, 'QA_ADMIN_PASSWORD is required');

(async () => {
 const browser = await chromium.launch({headless:true, ...(process.env.QA_CHROMIUM ? {executablePath:process.env.QA_CHROMIUM} : {}), args:['--no-sandbox']});
 const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 context.setDefaultTimeout(15000);
 const page = await context.newPage();
 let releaseRefresh;
 try {
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base, {waitUntil:'networkidle'});
  await page.getByLabel('З чого почнемо?', {exact:true}).fill('Хочу пісню коханому Олександру. Ми познайомилися у Львові, маємо доньку. Хочу подякувати за нашу сім’ю. Від мене.');
  await page.locator('input[type=checkbox]').check();
  const intake = page.waitForResponse(r => r.url() === base+'/api/orders' && r.request().method() === 'POST');
  await page.getByRole('button', {name:'Почати розмову',exact:true}).click();
  const created = await intake;
  assert.equal(created.status(),201);
  const id = (await created.json()).id;
  await page.getByLabel('Ваша відповідь',{exact:true}).waitFor();
  await page.waitForLoadState('networkidle');
  await page.goto(base+'/admin',{waitUntil:'networkidle'});
  await page.getByLabel('Пароль',{exact:true}).fill(process.env.QA_ADMIN_PASSWORD);
  await page.getByRole('button',{name:'Увійти →',exact:true}).click();
  await page.locator('.order-row').first().waitFor();
  await page.locator('.order-row').first().click();
  await page.locator('input[name=completeBrief]').check();

  // Hold the actual post-save refresh, leaving a deterministic window for typing.
  let arm = true, reachedRefresh;
  const reached = new Promise(resolve => { reachedRefresh = resolve; });
  const held = new Promise(resolve => { releaseRefresh = resolve; });
  await page.route('**/api/orders', async route => {
   if (arm && route.request().method() === 'GET') {
    arm = false; reachedRefresh(); await held;
   }
   await route.continue();
  });
  const saveButton = page.getByRole('button',{name:'Зберегти зміни',exact:true});
  const briefResponse = page.waitForResponse(r => r.url() === base+'/api/orders' && r.request().method() === 'PATCH');
  await saveButton.click();
  assert.equal((await briefResponse).status(),200);
  await reached;
  const amount = page.locator('input[name=paymentAmount]');
  const disabledDuringRefresh = await amount.isDisabled();
  // On the old code fill succeeds before refresh, then the keyed form discards it.
  // With the fix Playwright waits until the refreshed form becomes editable.
  const typing = amount.fill('1000');
  const releaseTimer = setTimeout(releaseRefresh, 300);
  await typing;
  await held;
  clearTimeout(releaseTimer);
  await page.waitForFunction(() => {
   const form = document.querySelector('input[name=completeBrief]');
   const button = document.querySelector('.order-detail form button[type=submit], .order-detail form button.button');
   return form?.disabled && button && !button.disabled && !button.closest('fieldset')?.disabled;
  });
  assert.equal(await amount.inputValue(),'1000','Amount typed during refresh must not disappear');
  assert.equal(disabledDuringRefresh,true,'Editable controls must wait for save/refresh completion');
  await page.locator('input[name=paymentNote]').fill('ВИГАДАНА оплата регресійного QA');
  const paidResponse = page.waitForResponse(r => r.url() === base+'/api/orders' && r.request().method() === 'PATCH');
  await saveButton.click();
  const paid = await paidResponse;
  assert.equal(paid.request().postDataJSON().payment.amount,100000);
  assert.equal(paid.status(),200);
  const data = await paid.json();
  assert.equal(data.id,id);assert.equal(data.paid,100000);assert.equal(data.status,'Текст');
  await page.reload({waitUntil:'networkidle'});
  const orders = await page.evaluate(async () => (await fetch('/api/orders')).json());
  assert.equal(orders.filter(o => o.id === id).length,1);
  assert.equal(orders.find(o => o.id === id).paid,100000);
  console.log(JSON.stringify({passed:true,id,disabledDuringRefresh,amountMinor:100000,status:data.status}));
 } finally {
  releaseRefresh?.();
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
