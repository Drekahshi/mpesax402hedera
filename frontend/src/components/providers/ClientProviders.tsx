'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { useState } from 'react';
import { config } from '@/lib/wagmi';
import { PrivyAuthProvider } from '@/components/providers/PrivyAuthProvider';

/**
 * ClientProviders: wraps the whole app in WagmiProvider (Ethereum & Hedera (X402)),
 * TanStack QueryClient, and PrivyAuthProvider (Google login → embedded
 * Ethereum & Hedera wallet, PRD 1).
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
  }));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <PrivyAuthProvider>
          {children}
        </PrivyAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
