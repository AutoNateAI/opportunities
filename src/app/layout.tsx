import type { Metadata, Viewport } from 'next';
import AuthGate from '@/components/AuthGate';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stop Guessing Where Local Money Moves | AutoNateAI',
  description: 'See the businesses, funders, events, schools, agencies, and power players shaping opportunity in your region.',
  metadataBase: new URL('https://opportunities.autonateai.com'),
  openGraph: {
    title: 'Stop Guessing Where Local Money Moves',
    description: 'AutoNateAI maps the local money signals, decision makers, and regional openings worth chasing next.',
    url: 'https://opportunities.autonateai.com',
    siteName: 'AutoNateAI Opportunities',
    type: 'website',
    images: [
      {
        url: '/og-regional-opportunity-portal.png',
        width: 1200,
        height: 630,
        alt: 'AutoNateAI Regional Opportunity Portal map with glowing local money opportunity pins.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stop Guessing Where Local Money Moves',
    description: 'Find the local money signals, decision makers, and regional openings worth chasing next.',
    images: ['/og-regional-opportunity-portal.png'],
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
