import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ClientProviders } from '@/components/providers/ClientProviders';
import LayoutWrapper from '@/components/shared/LayoutWrapper';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KAI Nuvari - Ethereum & Hedera (X402) DeFi Ecosystem',
  description: 'Forest-finance DeFi on Ethereum & Hedera. Yield vaults, AMM pools, community commodities, DAO governance, and M-Pesa payments.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} text-white min-h-[100dvh]`}>
        <ClientProviders>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </ClientProviders>
      </body>
    </html>
  );
}


