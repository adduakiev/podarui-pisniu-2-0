import { listMedia } from '@/lib/db';
import { OrderFlow, OrderForm } from './widgets';

type LandingContent = {
  heading: string;
  intro: string;
  cta: string;
  recipient: string;
  occasion: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export function SongLanding({ content }: { content: LandingContent }) {
  const examples = listMedia(true).filter(item => item.kind === 'song');

  return <OrderFlow><div className="public-site">
    <header className="nav">
      <a className="logo" href="/">Подаруй <span>♬</span> пісню</a>
      <nav aria-label="Навігація"><a href="#prices">Вартість</a><a href="#order">Почати розмову</a></nav>
    </header>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ВАША ІСТОРІЯ СТАНЕ ПІСНЕЮ</p>
          <h1>{content.heading}</h1>
          <p className="intro">{content.intro}</p>
          <a className="button" href="#order">{content.cta} ↗</a>
          <p>2000 грн · 1000 грн передоплати, решта після отримання пісні.</p>
        </div>
      </section>
      {examples.length > 0 && <section className="section" aria-labelledby="examples-title">
        <h2 id="examples-title">Послухайте наші роботи</h2>
        <div className="cards">{examples.map(example => <article className="card" key={example.id}>
          <h3>{example.title}</h3><p>{example.description}</p>
          <audio controls preload="none" aria-label={example.title} src={'/api/media/' + example.id}/>
        </article>)}</div>
      </section>}
      {content.sections.map(section => <section className="section" key={section.heading}
        id={/коштує|Вартість/.test(section.heading) ? 'prices' : undefined}>
        <h2>{section.heading}</h2>
        <div className="intro">{section.paragraphs.map((paragraph, index) => {
          if (paragraph.startsWith('### ')) {
            const [question, ...answer] = paragraph.slice(4).split('\n');
            return <div key={index}><h3>{question}</h3><p>{answer.join('\n')}</p></div>;
          }
          return <p key={index}>{paragraph}</p>;
        })}</div>
      </section>)}
      <section className="section" id="order">
        <p className="eyebrow">ПОЧНЕМО З ВАШОЇ ІСТОРІЇ</p>
        <h2>{content.cta}</h2>
        <p>Можете почати з кількох слів або поставити запитання.</p>
        <OrderForm testMode={process.env.LOCAL_ONLY === '1'} recipient={content.recipient} occasion={content.occasion}/>
      </section>
    </main>
    <footer className="footer"><a href="/">Подаруй пісню</a><a href="/legal/data">Обробка даних</a></footer>
  </div></OrderFlow>;
}
