import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

/* Two families, deliberately. Inter for everything that is read as language,
   JetBrains Mono for anything that is read as a value: codes, money, times. */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: {
    default: 'Hotel Sales Hub',
    template: '%s · Hotel Sales Hub',
  },
  description:
    'Hotel Sales & Guest Relationship Hub. Turns Chatwoot conversations into leads, availability checks, quotations, and reservation handoffs.',
  applicationName: 'Hotel Sales Hub',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom is never disabled (PRD 15.2 rule 10).
  maximumScale: 5,
  themeColor: '#f6f5f2',
};

/** Light is the default; a stored dark preference is applied before first paint. */
/*
 * Tema dan lebar navigasi dipasang sebelum cat pertama. Keduanya mengubah
 * tata letak, jadi membacanya setelah React terpasang akan terlihat sebagai
 * kedipan pada setiap pemuatan halaman.
 */
const shellBootstrap = `(function(){try{
  var t=localStorage.getItem('crm-theme');
  if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}
  if(localStorage.getItem('crm-nav')==='collapsed'){document.documentElement.setAttribute('data-nav','collapsed');}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: shellBootstrap }} />
      </head>
      <body className={`${inter.variable} ${mono.variable}`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-on-primary"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
