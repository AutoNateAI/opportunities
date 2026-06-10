import type { Metadata, Viewport } from 'next';
import AuthGate from '@/components/AuthGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoNateAI Opportunities',
  description: 'Regional opportunity intelligence portal for discovering, ranking, and executing local B2B growth plays.',
  metadataBase: new URL('https://opportunities.autonateai.com'),
  openGraph: {
    title: 'AutoNateAI Opportunities',
    description: 'Discover, prioritize, connect, and execute across a regional opportunity graph.',
    url: 'https://opportunities.autonateai.com',
    siteName: 'AutoNateAI Opportunities',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#030712',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
