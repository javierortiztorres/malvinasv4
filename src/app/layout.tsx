import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MALVINAS 2.0 — Nueva Farmacia Badra',
  description: 'Manufactura aditiva de cápsulas magistrales — PILL.AR',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
