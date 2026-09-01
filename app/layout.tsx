import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Organizador GyT',
  description: 'Organiza fotografías de certificadoras por agencia, caja e IP sin subir archivos a servidores.',
  openGraph: {
    title: 'Organizador GyT',
    description: 'Documentación de certificadoras',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Organizador GyT - Documentación de certificadoras' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Organizador GyT',
    description: 'Documentación de certificadoras',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
