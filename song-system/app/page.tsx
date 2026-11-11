import Image from 'next/image';
import { listMedia } from '@/lib/db';
import { OrderForm, Stories, OrderFlow, PlanLink } from './widgets';

import slots from '@/lib/song-slots.json';
import reviews from '@/lib/telegram-reviews.json';

export const dynamic = 'force-dynamic';
const occasions = [
  { icon: '♡', title: 'Коханій людині', text: 'Ваше знайомство. Ваші жарти. Ваше «назавжди».', note: 'Про те, що знаєте тільки ви', className: 'love' },
  { icon: '✦', title: 'На день народження', text: 'Замість ще одного подарунка — історія про людину.', note: 'Щоб відчути: мене знають і люблять', className: 'birthday' },
  { icon: '⌂', title: 'Мамі, татові, рідним', text: 'Ті самі слова вдячності, які давно хотілося сказати.', note: 'Тепло, яке залишається поруч', className: 'family' },
];
const faqs = [
  ['Що потрібно розповісти для пісні?', 'Для кого вона, з якого приводу, важливі спогади, імена та бажаний настрій. Не потрібно вміти красиво писати — допоможемо зібрати історію у переписці.'],
  ['Коли буде готова пісня?', 'Протягом 48 годин після отримання повної інформації для створення пісні. Якщо подарунок потрібен до певної дати, обов’язково зазначте її — погодимо дедлайн перед початком роботи.'],
  ['Можна використати мій текст?', 'Так. Формат за вашим текстом коштує 1000 грн після оцінки тексту. Погодимо стиль та особливості музичного виконання.'],
  ['Як я отримаю готову пісню?', 'Надішлемо готову роботу файлом у ваш месенджер або на email. Збережіть файл собі, щоб він був під рукою в день подарунка.'],
  ['Як погоджуються оплата та правки?', 'Перед початком погодимо спосіб і порядок оплати та включені правки. Посилання на оплату або реквізити надішлемо у переписці.'],
  ['Чи є спеціальна ціна для військових?', 'Так, 1000 грн для військових та родин, які замовляють пісню для військових. Оберіть цей формат у заявці.'],
];
export default function Home() {
  const media = listMedia(true);
  const songs = media.filter(m => m.kind === 'song');
  return <OrderFlow><div className="public-site">
    <header className="nav">
      <a className="logo" href="/" aria-label="Подаруй пісню — головна">Подаруй <span>♬</span> пісню</a>
      <nav aria-label="Навігація сайту"><a href="#examples">Послухати</a><a href="#reviews">Емоції та відгуки</a><a href="#prices">Вартість</a></nav>
      <a className="button small" href="#order">Створити пісню ↗</a>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy"><p className="eyebrow"><span className="live-dot"/> ОСОБИСТІ ІСТОРІЇ СТАЮТЬ МУЗИКОЮ</p>
          <h1>У вас є історія.<br/>У неї буде<br/><em>своя пісня.</em></h1>
          <p className="intro">Про ваше «пам’ятаєш?». Про найрідніших. Про почуття, для яких звичайних слів замало.</p>
          <div className="hero-actions"><a className="button" href="#order">Подарувати пісню <span>↗</span></a><a className="listen-link" href="#examples"><span className="play-mini" aria-hidden="true">▶</span>Спочатку послухати</a></div>
          <div className="hero-facts"><span><strong>48 годин</strong> після повної інформації</span><span><strong>Ваша історія</strong> у кожному рядку</span></div>
        </div>
        <div className="hero-scene">
          <div className="scene-orbit" aria-hidden="true"/>
          <span className="scene-caption">ОДНА ПІСНЯ. ТІЛЬКИ ВАША.</span>
          <div className="hero-art"><Image src="/brand/hero.jpg" alt="Подарункова коробка з музичними нотами — ілюстрація з нашого сайту" fill priority sizes="(max-width: 760px) 92vw, 45vw"/></div>
          <div className="song-note"><span className="note-icon" aria-hidden="true">♬</span><div><strong>«Це ж про нас…»</strong><span>Мить, заради якої дарують пісню</span></div><div className="mini-wave" aria-hidden="true">{[12,24,16,30,20,10,25].map((h,i)=><i key={i} style={{height:h,animationDelay:`${i*.12}s`}}/>)}</div></div>
          <span className="scene-tag">Спогади, які можна почути ♡</span>
        </div>
      </section>
      <div className="feeling-strip" aria-hidden="true"><span>Кохання</span><b>✦</b><span>Вдячність</span><b>✦</b><span>Ваші спогади</span><b>✦</b><span>Мурашки</span><b>✦</b><span>Пісня про вас</span></div>
      <section className="section occasion-section"><div className="section-heading"><div><p className="eyebrow">НЕ ПОТРІБЕН ІДЕАЛЬНИЙ ПРИВІД</p><h2>Потрібна лише<br/><em>важлива людина.</em></h2></div><p>Річниця, день народження чи просте «дякую, що ти є». Найкраща історія вже у вас.</p></div><div className="grid occasions">{occasions.map(o=><a className={`occasion-card ${o.className}`} href="#order" key={o.title}><span className="occasion-icon" aria-hidden="true">{o.icon}</span><span className="occasion-note">{o.note}</span><h3>{o.title}</h3><p>{o.text}</p><span className="occasion-arrow" aria-hidden="true">↗</span></a>)}</div></section>
      <section className="section examples-section" id="examples"><div className="section-heading"><div><p className="eyebrow">МЕНШЕ СЛІВ. БІЛЬШЕ МУЗИКИ.</p><h2>Послухайте.<br/><em>Уявіть свою історію.</em></h2></div><p>Різні голоси й настрої. Бо ніжна подяка мамі та ваша історія кохання звучать по-різному.</p></div>
        <div className="grid song-grid">{slots.map((slot,i)=>{const song=songs.find(s=>s.slot===slot.id);return <article className="card song-card" key={slot.id}><div className="record-art" aria-hidden="true"><span className="record"><i>♬</i></span><span className="track-number">{String(i+1).padStart(2,'0')}</span></div><span className="song-voice">{slot.voice} голос · {slot.occasion}</span><h3>{slot.title}</h3><p>{slot.recipient}</p>{song?<audio aria-label={`Послухати: ${slot.title}`} controls preload="none" src={'/api/media/'+song.id}/>:<p className="song-pending">Готуємо MP3 для цього прикладу</p>}</article>})}{songs.filter(s=>!s.slot).map(song=><article className="card song-card" key={song.id}><h3>{song.title}</h3><p>{song.description}</p><audio aria-label={`Послухати: ${song.title}`} controls preload="none" src={'/api/media/'+song.id}/></article>)}</div><div className="stream-links"><a href="https://open.spotify.com/artist/28vjHkIo28nMYdKjaGEtJs" target="_blank" rel="noreferrer">Поки послухати Spotify ↗</a><a href="https://www.youtube.com/channel/UCpNiO_iPIix5FqIPGHfjtpg" target="_blank" rel="noreferrer">YouTube ↗</a></div>
      </section>
      <section className="section process-section"><p className="eyebrow">ВАМ НЕ ПОТРІБНО БУТИ АВТОРОМ</p><div className="section-heading"><h2>Розкажіть як є.<br/><em>Ми почуємо головне.</em></h2><p>Без складних анкет на старті. З увагою до імен, наголосів і маленьких деталей, які роблять історію вашою.</p></div><div className="grid steps">{[['01','Розкажіть про людину','Кілька спогадів, ваші особливі слова та бажаний настрій. Ми допоможемо зібрати все потрібне.'],['02','Погодимо звучання','Голос, стиль і важливі деталі. Щоб у пісні впізнали вашу історію.'],['03','Подаруйте цей момент','Отримайте готовий файл. Увімкніть пісню разом або надішліть її найріднішій людині.']].map(([n,t,d])=><article key={n}><span className="step-number">{n}<span aria-hidden="true">↗</span></span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      <section className="section reviews-section" id="reviews"><div className="section-heading"><div><p className="eyebrow">ПІСЛЯ ПЕРШОГО ПРОСЛУХОВУВАННЯ</p><h2>Емоції, які<br/><em>важко приховати.</em></h2></div><a className="text-link" href="https://www.instagram.com/podaruipisnu/" target="_blank" rel="noreferrer">Наш Instagram ↗</a></div><Stories items={media.filter(m=>m.kind==='review')} quotes={reviews}/><p className="reviews-source">Справжні текстові відгуки з Telegram. Імена приховано; картки оформлено для сайту.</p></section>
      <section className="section prices-section" id="prices"><p className="eyebrow">ВАША ІСТОРІЯ — ВАШ ФОРМАТ</p><h2>Подарунок із сенсом.<br/><em>Без зайвих складнощів.</em></h2><div className="grid">{[{plan:'story' as const,t:'З вашої історії',p:'2000',d:'Створимо текст і пісню з ваших спогадів.',tag:'Від першого слова до готової пісні',items:['Текст про вашу людину','Погоджені голос і настрій','Готова пісня файлом'],featured:true},{plan:'own' as const,t:'З вашим текстом',p:'1000',d:'Ви вже написали важливі слова. Допоможемо їм зазвучати.',tag:'Для ваших власних слів',items:['Оцінка наданого тексту','Погоджене музичне виконання','Готова пісня файлом'],featured:false},{plan:'military' as const,t:'Для військових',p:'1000',d:'Для військових та родин, які замовляють пісню для військових.',tag:'З вдячністю нашим захисникам',items:['Особиста історія','Увага до важливих деталей','Готова пісня файлом'],featured:false}].map(({plan,t,p,d,tag,items,featured})=><article className={`card price ${featured?'featured':''}`} key={t}><span className="price-tag">{tag}</span><h3>{t}</h3><p className="amount">{p} <small>грн</small></p><p>{d}</p><ul>{items.map(item=><li key={item}>{item}</li>)}</ul><PlanLink plan={plan} className={featured?'button':'price-cta'}>Почати історію ↗</PlanLink></article>)}</div><p className="price-footnote">48 годин після отримання повної інформації. Оплату та включені правки погоджуємо перед початком.</p></section>
      <section className="section faq-section"><div><p className="eyebrow">ЩО ЩЕ ХОЧЕТЬСЯ ЗНАТИ</p><h2>Можна<br/><em>просто запитати.</em></h2><a className="text-link" href="https://t.me/Podaruipisnu">Написати нам у Telegram ↗</a></div><div className="faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <section className="section order-section" id="order"><div><p className="eyebrow">ВАША ІСТОРІЯ ПОЧИНАЄТЬСЯ ТУТ</p><h2>Кому ви хочете<br/>подарувати<br/><em>ці мурашки?</em></h2><p>Залиште контакт і кілька слів. Далі поговоримо у зручному месенджері та допоможемо з деталями.</p><div className="order-note"><span aria-hidden="true">♡</span><p>Не шукайте ідеальних слів.<br/>Розкажіть своїми.</p></div><a className="text-link" href="https://t.me/Podaruipisnu">Зручніше одразу в Telegram? ↗</a></div><OrderForm testMode={process.env.LOCAL_ONLY==='1'}/></section>
    </main>
    <footer><div className="footer-top"><div className="logo">Подаруй <span>♬</span> пісню</div><p>Найважливіше —<br/>тепер у вашій пісні.</p></div><div className="footer-links"><a href="tel:+380688787861">+38 068 878 78 61</a><a href="mailto:podaruipisnu@gmail.com">podaruipisnu@gmail.com</a><a href="https://t.me/Podaruipisnu">Telegram</a><a href="https://wa.me/380688787861">WhatsApp</a><a href="https://www.instagram.com/podaruipisnu/">Instagram</a><a href="https://music.youtube.com/channel/UCpNiO_iPIix5FqIPGHfjtpg">YouTube Music</a><a href="https://www.youtube.com/@Подаруйпісню">YouTube</a></div><div className="footer-links"><a href="/legal/privacy">Конфіденційність</a><a href="/legal/data">Персональні дані</a><a href="/legal/offer">Оферта</a><a href="/legal/refund">Повернення</a></div><p className="muted">ТОВ «ПОДАРУЙ ТРЕК ГЛОБАЛ» · Виконавець послуги за офертою: ФОП Костюшко Костянтин Володимирович.</p><p className="muted">Тестова версія · <a href="/admin">Адмінка</a></p></footer>
    <div className="mobile-order"><span>Ваша історія.<br/><strong>Ваша пісня.</strong></span><a className="button small" href="#order">Почати ↗</a></div>
  </div></OrderFlow>;
}
