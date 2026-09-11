'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Address } from 'viem';
import { sepolia } from 'wagmi/chains';
import { createWalletClient, custom } from 'viem';
import { ERC20_ABI } from '@/lib/erc20abi';

/**
 * Context wrapper around the Privy embedded wallet (PRD 1). The provider
 * (`components/providers/PrivyAuthProvider`) decides whether to back this
 * context with the real Privy SDK or a safe fallback stub (no appId set).
 * Consumers always call `usePrivyAuth()` — it never throws.
 */

export interface PrivyAuthSyncResult {
  ok: boolean;
  reason?: string;
  isNew?: boolean;
  kaiBar?: number;
  [key: string]: unknown;
}

export interface PrivyAuthValue {
  ready: boolean;
  readyToUse: boolean;
  authenticated: boolean;
  isLoggedIn: boolean;
  user: { id?: string } | null;
  privyUserId: string | null;
  email: string | null;
  name: string | null;
  address: Address | null;
  wallet: unknown | null;
  client: ReturnType<typeof createWalletClient> | null;
  signInWithGoogle: () => Promise<PrivyAuthSyncResult>;
  login: (() => Promise<void>) | (() => void);
  logout: () => Promise<void> | void;
  createWallet: () => Promise<void> | void;
  connectWallet: (...args: any[]) => Promise<void> | void;
  getTokenBalance: (tokenAddress: Address, decimals?: number) => Promise<bigint>;
  sendToken: (params: { tokenAddress: Address; to: Address; amount: bigint }) => Promise<string | { hash: Address }>;
  claimAirdrop: (params: { vault: Address; amount: bigint; proof: `0x${string}`[] }) => Promise<string | { hash: Address }>;
  syncToBackend: () => Promise<PrivyAuthSyncResult>;
  syncState: 'idle' | 'linking' | 'linked' | 'error';
  error: string | null;
}

export const PrivyAuthContext = createContext<PrivyAuthValue | null>(null);

export function usePrivyAuth(): PrivyAuthValue {
  const ctx = useContext(PrivyAuthContext);
  if (!ctx) {
    // No provider — return a safe no-op stub so pages don't crash during SSR
    // or when Privy isn't configured.
    return {
      ready: false,
      readyToUse: false,
      authenticated: false,
      isLoggedIn: false,
      user: null,
      privyUserId: null,
      email: null,
      name: null,
      address: null,
      wallet: null,
      client: null,
      signInWithGoogle: async () => ({ ok: false, reason: 'privy-not-configured' }),
      login: async () => {},
      logout: () => {},
      createWallet: async () => {},
      connectWallet: async () => {},
      getTokenBalance: async () => 0n,
      sendToken: async () => { throw new Error('Wallet not connected'); },
      claimAirdrop: async () => { throw new Error('Wallet not connected'); },
      syncToBackend: async () => ({ ok: false, reason: 'privy-not-configured' }),
      syncState: 'idle',
      error: null,
    };
  }
  return ctx;
}

export const PRIVY_WAGMI_CHAIN = sepolia;
export { ERC20_ABI, createWalletClient, custom };
export type { Address };