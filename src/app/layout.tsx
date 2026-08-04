import type { Metadata } from 'next';
import { Archivo, Inter } from 'next/font/google';
import './globals.css';

// Archivo: titulares y marca (600/700/800). Inter: todo el texto (400/500/600).
const archivo = Archivo({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-archivo' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'MALVINAS — Producción magistral',
  description: 'Manufactura aditiva de cápsulas magistrales — PILL.AR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
