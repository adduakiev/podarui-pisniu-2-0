'use client';
import {useState,useEffect,useRef} from 'react';
type Feedback={replacement:string;reason:string};
type Session={id:string;token:string;telegramUrl?:string};type Chat={mode?:'assistant'|'producer';telegramUrl?:string;messages:{role:string;text:string;feedback?:Feedback}[];canConfirm:boolean;confirmed:boolean;paymentLink:string};
export function OrderChat({session,onNewTest}:{session:Session;onNewTest?:()=>void}){const [chat,setChat]=useState<Chat|null>(null),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>{heading.current?.focus({preventScroll:true});heading.current?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})},[]);const messages=useRef<HTMLDivElement>(null);useEffect(()=>{if(messages.current)messages.current.scrollTop=messages.current.scrollHeight},[chat]);
 async function send(message?:string,confirm=false){setBusy(true);setError('');try{const r=await fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...session,message,confirm})});const data=await r.json();if(!r.ok)throw Error(data.error);setChat(data);if(message)setText('')}catch(e){setError(e instanceof Error?e.message:'Не вдалося з’єднатися')}finally{setBusy(false)}}
 useEffect(()=>{void send()},[session.id]);
 const handoff=`Вітаю! Хочу завершити замовлення пісні №${session.id.slice(0,8)}. Заявку вже залишено на сайті.`;
 return <section className="order-chat" aria-label="Завершення замовлення">{onNewTest&&<div className="test-note"><button type="button" disabled={busy} onClick={onNewTest}>Очистити історію</button><p>Почне новий тест із чистої форми. Попередня переписка залишиться в адмінці.</p></div>}<p className="chat-success">✓ Заявку отримано</p><h3 ref={heading} tabIndex={-1}>Олена · Подаруй пісню</h3><p>Розкажіть тут або продовжіть розмову в Telegram.</p><a className="button" href={chat?.telegramUrl||session.telegramUrl||"https://t.me/podaruy_pisnyu_bot"} target="_blank" rel="noopener noreferrer">Продовжити в Telegram ↗</a><p className="muted">У Telegram натисніть «Розпочати» — бот знайде вашу заявку. Або відповідайте тут, у чаті нижче.</p><div ref={messages} className="chat-messages" aria-live="polite">{chat?.messages.map((m,i)=><div key={i} className={'chat-bubble '+m.role}><small>{m.role==='user'?'Ви':'Олена'}</small><p>{m.text}</p>{onNewTest&&m.role==='assistant'&&<ReplyFeedback session={session} index={i} initial={m.feedback}/>}</div>)}</div>{!chat&&<button type="button" disabled={busy} onClick={()=>send()}>{busy?'Відкриваємо розмову…':'Відкрити чат'}</button>}{chat&&<>{chat.mode==='producer'&&<p role="status" className="notice">Питання передано продюсеру. Автоматичні відповіді призупинено; ваші додаткові повідомлення збережуться.</p>}<label>Ваша відповідь<textarea value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={15000} placeholder="Напишіть своїми словами…"/></label><button className="button" type="button" disabled={busy||!text.trim()} onClick={()=>send(text)}>{busy?'Зберігаємо…':chat.mode==='producer'?'Додати повідомлення продюсеру':'Надіслати відповідь ↗'}</button>{chat.canConfirm&&<button className="button secondary" type="button" disabled={busy} onClick={()=>send(undefined,true)}>Так, це мій задум</button>}{chat.confirmed&&(chat.paymentLink?<a className="button" href={chat.paymentLink} target="_blank" rel="noopener noreferrer">Перейти до оплати ↗</a>:<div className="chat-payment"><p>Деталі передано нашій команді. Тут з’явиться посилання після погодження умов.</p><button type="button" disabled={busy} onClick={()=>send()}>Перевірити посилання на оплату</button></div>)}</>}<p role="alert">{error}</p><details className="chat-alternative"><summary>Зручніше спілкуватися в месенджері?</summary><p>Продовжіть розмову з нами там, де вам зручно.</p><div className="chat-channels"><a href={chat?.telegramUrl||session.telegramUrl||"https://t.me/podaruy_pisnyu_bot"} target="_blank" rel="noopener noreferrer">Перейти в Telegram ↗</a><a href={'https://wa.me/380688787861?text='+encodeURIComponent(handoff)} target="_blank" rel="noopener noreferrer">Перейти у WhatsApp ↗</a></div><p className="muted">У Telegram напишіть номер заявки: {session.id.slice(0,8)}. Так ми знайдемо ваші деталі.</p></details></section>
}

function ReplyFeedback({session,index,initial}:{session:Session;index:number;initial?:Feedback}){
 const [saved,setSaved]=useState(initial),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();
  const form=new FormData(e.currentTarget);
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/conversation',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:session.id,token:session.token,index,replacement:form.get('replacement'),reason:form.get('reason')})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error);
   setSaved(data);setOpen(false);
  }catch(e){setError(e instanceof Error?e.message:'Не вдалося зберегти оцінку')}finally{setBusy(false)}
 }
 return <div className="test-note">
  <button type="button" aria-expanded={open} disabled={busy} onClick={()=>setOpen(!open)}>{saved?'Змінити оцінку':'Скоригувати відповідь'}</button>
  {saved&&!open&&<p role="status">Збережено. Ваш варіант: {saved.replacement}</p>}
  {open&&<form className="form" onSubmit={submit}>
   <label>Як краще відповісти?<textarea name="replacement" required maxLength={3000} rows={3} defaultValue={saved?.replacement}/></label>
   <label>Що не сподобалося? (необов’язково)<textarea name="reason" maxLength={1000} rows={2} defaultValue={saved?.reason}/></label>
   <button type="submit" disabled={busy}>{busy?'Зберігаємо…':'Зберегти оцінку'}</button>
   <p role="alert">{error}</p>
  </form>}
 </div>
}
