import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Поступашки · Демо команды Поступили',description:'Календарь размещений, прозрачная атрибуция и путь от ссылки до оплаты.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
