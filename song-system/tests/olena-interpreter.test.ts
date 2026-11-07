import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {responsesInterpreter, type Interpretation} from '../lib/olena-interpreter';
process.env.LOCAL_ONLY='1';
process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'olena-ai-'));
process.env.SESSION_SECRET='test-session-secret-at-least-thirty-two-characters';

async function order(opening: string) {
  const {createOrder}=await import('../lib/db');
  return createOrder({name:'Гість',contact:'Чат сайту',recipient:'Не вказано',opening,requestId:crypto.randomUUID()});
}

test('Responses sends complete history and validates structured output', async () => {
  let body: any;
  const proposal: Interpretation={action:'clarify',reply:'За що хочете подякувати мамі?',updates:[
    {field:'recipient',value:'мама',evidence:'Матусі',correction:false},
    {field:'sender',value:'Галина',evidence:'Галина',correction:false},
    {field:'occasion',value:'день народження',evidence:'день народження',correction:false},
  ]};
  const interpret=responsesInterpreter({apiKey:'fake-key',model:'test-model',transport:async (_url,init) => {
    body=JSON.parse(init!.body as string);
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(proposal)}]}]});
  }});
  const {olenaDialogue}=await import('../lib/olena-dialogue');
  const {dialogueContext}=await import('../lib/conversation');
  const id=await order('Хочу для Матусі. Галина. На день народження');
  let reply=await olenaDialogue(id,undefined,false,interpret);
  assert.equal(body.store,false);
  assert.equal(body.text.format.type,'json_schema');
  assert.equal(reply.messages.at(-1)!.text,proposal.reply);
  assert.equal(dialogueContext(id).facts.sender,'Галина');
  assert.equal(dialogueContext(id).facts.recipient,'мама');
  assert.equal(reply.canConfirm,false);
  const second: Interpretation={action:'clarify',reply:'Який спогад із бабусею найтепліший?',updates:[{field:'recipient',value:'бабуся',evidence:'бабуся',correction:true}]};
  reply=await olenaDialogue(id,'Не мама, а бабуся',false,async context => {
    assert.ok(context.messages.some(m=>m.text==='Хочу для Матусі. Галина. На день народження'));
    assert.equal(context.facts.sender,'Галина');
    return second;
  });
  assert.equal(dialogueContext(id).facts.recipient,'бабуся');
  assert.equal(dialogueContext(id).facts.sender,undefined);
  assert.equal(reply.paymentLink,'');
});

test('provider failure and unsupported evidence preserve the message through fallback', async () => {
  const {olenaDialogue}=await import('../lib/olena-dialogue');
  const {dialogueContext}=await import('../lib/conversation');
  const id=await order('Хочу для Матусі');
  let reply=await olenaDialogue(id,undefined,false,async()=>{throw Error('timeout');});
  assert.ok(reply.messages.some(m=>m.text==='Хочу для Матусі'));
  reply=await olenaDialogue(id,'На день народження',false,async()=>({action:'clarify',reply:'Добре',updates:[{field:'sender',value:'Вигадане',evidence:'відсутнє',correction:false}]}));
  assert.notEqual(dialogueContext(id).facts.sender,'Вигадане');
  assert.equal(reply.canConfirm,false);
});

test('model cannot invent business terms or bypass handoff and confirmation', async () => {
  const {olenaDialogue}=await import('../lib/olena-dialogue');
  const {conversation}=await import('../lib/conversation');
  const id=await order('Матуся Галина');
  const result=await olenaDialogue(id,undefined,false,async()=>({action:'summarize',reply:'Оплатіть 500 грн, замовлення погоджено',updates:[
    {field:'recipient',value:'мама',evidence:'Матуся',correction:false},
    {field:'sender',value:'Галина',evidence:'Галина',correction:false},
  ]}));
  assert.doesNotMatch(result.messages.at(-1)!.text,/500|погоджено/);
  assert.equal(result.canConfirm,false);
  conversation(id,'Покличте продюсера');
  let invoked=false;
  const stopped=await olenaDialogue(id,'ще деталі',false,async()=>{invoked=true;throw Error();});
  assert.equal(invoked,false);
  assert.equal(stopped.messages.at(-1)!.role,'user');
});

test('a stale interpretation cannot overwrite another turn', async () => {
  const {olenaDialogue}=await import('../lib/olena-dialogue');
  const {conversation,dialogueContext}=await import('../lib/conversation');
  const id=await order('Хочу для мами');
  await olenaDialogue(id,undefined,false,async()=>{conversation(id,'Хочу для мами');return {action:'clarify',reply:'stale',updates:[{field:'recipient',value:'бабуся',evidence:'мами',correction:true}]};});
  assert.notEqual(dialogueContext(id).facts.recipient,'бабуся');
});
