import './globals.css';import type {Metadata} from 'next';
export const metadata:Metadata={title:'Подаруй пісню — ваша історія звучить',description:'Персональна пісня за вашою історією. 48 годин після отримання повної інформації.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="uk"><body>{children}</body></html>}
