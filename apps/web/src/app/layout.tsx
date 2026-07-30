import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Trade-Z — AI Trading Operating System',
    template: '%s | Trade-Z',
  },
  description:
    'Trade-Z is an AI-powered trading operating system that continuously scans financial markets, evaluates opportunities, explains every decision, and manages trades with institutional-grade discipline.',
  keywords: [
    'AI trading',
    'forex',
    'trading platform',
    'automated trading',
    'market analysis',
    'trading signals',
  ],
  authors: [{ name: 'Trade-Z' }],
  openGraph: {
    title: 'Trade-Z — AI Trading Operating System',
    description:
      'AI-powered trading OS that thinks like an institutional trader.',
    type: 'website',
    locale: 'en_US',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
