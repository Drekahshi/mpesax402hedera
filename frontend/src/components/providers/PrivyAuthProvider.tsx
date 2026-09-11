'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { sepolia } from 'wagmi/chains';
import { createWalletClient, custom, type Address } from 'viem';
import {
  PrivyAuthContext,
  type PrivyAuthValue,
  type PrivyAuthSyncResult,
} from '@/lib/privy-auth';
import { ERC20_ABI } from '@/lib/erc20abi';
import { AIRDROP_ABI } from '@/lib/airdropAbi';

/**
 * PrivyAuthProvider — Google login → embedded Ethereum & Hedera (X402) wallet (PRD 1).
 *
 * Every user who signs in with Google is given a non-custodial embedded EVM
 * wallet on Sepolia / Hedera Testnet. Kainovari never sees or stores any private key —
 * Privy owns key management end to end.
 *
 * The appId is client-safe (NEXT_PUBLIC_ prefix), so it is fine in the
 * browser. `createOnLogin: 'all-users'` guarantees a wallet is created for
 * every new Google login (no extra setup step for the user).
 *
 * This component also renders the inner `PrivyAuthContextProvider` that
 * exposes `usePrivyAuth()` to the rest of the app — bridging the raw Privy
 * SDK hooks (`usePrivy`, `useWallets`) into the typed context consumed by the
 * wallet and Kai Bar dashboards.
 */
export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // No Privy app configured — render children unchanged (e.g. dev with
    // MetaMask/Core fallback) rather than crashing the whole app.
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['google'],
        loginMethodsAndOrder: { primary: ['google'] },
        appearance: {
          theme: 'dark',
          accentColor: '#10b981',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'all-users' },
        },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      <PrivyAuthContextProvider>{children}</PrivyAuthContextProvider>
    </PrivyProvider>
  );
}

/**
 * Bridges the raw Privy SDK into the rest of the app via PrivyAuthContext.
 * This is what actually makes `usePrivyAuth()` return live values instead of
 * the safe no-op stub defined in lib/privy-auth.ts.
 */
function PrivyAuthContextProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, createWallet } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const [syncState, setSyncState] = useState<PrivyAuthValue['syncState']>('idle');
  const [error, setError] = useState<string | null>(null);
  const haveSynced = useRef(false);

  // The embedded Ethereum & Hedera wallet (first ethereum wallet on Sepolia from Privy).
  const wallet = useMemo(
    () =>
      (wallets || []).find((w) => w.type === 'ethereum' && w.chainId?.includes('11155111')) ??
      (wallets || [])[0] ??
      null,
    [wallets],
  );

  const address = useMemo<Address | null>(
    () => (wallet?.address ? (wallet.address as Address) : null),
    [wallet],
  );

  // Privy user identity → app fields.
  const privyUserId = (user?.id as string | undefined) ?? null;
  const email = user?.email?.address ?? null;
  const name = user?.google?.name ?? user?.email?.address ?? null;

  const builtLogin = useCallback(() => login({ loginMethods: ['google'] }), [login]);

  /**
   * Sends an ERC-20 transfer through the Privy embedded wallet. All signing
   * goes through Privy — the app never touches a private key (PRD 1 §6, §9).
   */
  const sendToken = useCallback(
    async ({ tokenAddress, to, amount }: { tokenAddress: Address; to: Address; amount: bigint }) => {
      if (!wallet || !address) throw new Error('Wallet not connected');
      const from = address as Address;
      const provider = await wallet.getEthereumProvider();
      const client = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
        account: from,
      });
      const hash = await client.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [to, amount],
        account: from,
      });
      return hash;
    },
    [wallet, address],
  );

  /**
   * Submits an airdrop claim through the Privy embedded wallet (PRD 2 §11).
   * The user proves their allocation with a Merkle proof; signing goes through
   * Privy — the app never touches a private key.
   */
  const claimAirdrop = useCallback(
    async ({ vault, amount, proof }: { vault: Address; amount: bigint; proof: `0x${string}`[] }) => {
      if (!wallet || !address) throw new Error('Wallet not connected');
      const from = address as Address;
      const provider = await wallet.getEthereumProvider();
      const client = createWalletClient({
        chain: sepolia,
        transport: custom(provider),
        account: from,
      });
      const hash = await client.writeContract({
        address: vault,
        abi: AIRDROP_ABI,
        functionName: 'claim',
        args: [amount, proof],
        account: from,
      });
      return hash;
    },
    [wallet, address],
  );

  /**
   * Creates/links the Kainovari KaiUser + KaiWallet and credits the welcome
   * bonus (handoff between PRD 1 and PRD 2). Idempotent.
   */
  const syncToBackend = useCallback(async (): Promise<PrivyAuthSyncResult> => {
    if (!privyUserId || !email || !address) {
      return { ok: false, reason: 'missing-identity', isNew: false };
    }
    setSyncState('linking');
    try {
      const res = await fetch('/api/kai-bar/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privyUserId, email, name, address }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncState('error');
        setError(data.error ?? 'Failed to link your account.');
        return { ok: false, reason: data.error, isNew: false };
      }
      setSyncState('linked');
      setError(null);
      return { ok: true, isNew: data.isNew, kaiBar: data.kaiBar, userId: data.userId };
    } catch (e: any) {
      console.error('[privy-auth] syncToBackend failed', e);
      setSyncState('error');
      setError('Could not reach our servers. Please try again.');
      return { ok: false, reason: 'network', isNew: false };
    }
  }, [privyUserId, email, name, address]);

  /**
   * One-shot "Continue with Google": logs in, then links the account to the
   * backend. Used by the hand-rolled sign-in buttons on the wallet / Kai Bar
   * pages.
   */
  const signInWithGoogle = useCallback(async (): Promise<PrivyAuthSyncResult> => {
    try {
      await builtLogin();
      // Allow Privy state (user + wallet) to hydrate before syncing.
      await new Promise((r) => setTimeout(r, 400));
      const result = await syncToBackend();
      return result;
    } catch (e: any) {
      const msg = String(e?.message ?? '').toLowerCase();
      if (msg.includes('cancelled') || msg.includes('rejected') || msg.includes('closed')) {
        return { ok: false, reason: 'login-cancelled', isNew: false };
      }
      setError('Google sign-in failed. Please try again.');
      return { ok: false, reason: 'login-failed', isNew: false };
    }
  }, [builtLogin, syncToBackend]);

  const loginFn = login;

  // Auto-sync once the user is authenticated and a wallet is ready, so a
  // returning user's account + welcome bonus are always attached.
  useEffect(() => {
    if (ready && authenticated && address && !haveSynced.current) {
      haveSynced.current = true;
      syncToBackend();
    }
  }, [ready, authenticated, address, syncToBackend]);

  const value = useMemo<PrivyAuthValue>(
    () => ({
      ready: ready && walletsReady,
      readyToUse: ready && walletsReady,
      authenticated,
      isLoggedIn: authenticated,
      user: user ? { id: user.id as string } : null,
      privyUserId,
      email,
      name,
      address,
      wallet,
      client: null,
      signInWithGoogle,
      login: loginFn,
      logout: async () => {
        haveSynced.current = false;
        await logout();
      },
      createWallet: async () => {
        try {
          await createWallet();
        } catch {
          /* surface via error state if needed */
        }
      },
      connectWallet: async () => loginFn(),
      getTokenBalance: async () => 0n,
      sendToken,
      claimAirdrop,
      syncToBackend,
      syncState,
      error,
    }),
    [
      ready, walletsReady, authenticated, user, privyUserId, email, name, address,
      wallet, signInWithGoogle, loginFn, logout, createWallet, sendToken,
      claimAirdrop, syncToBackend, syncState, error,
    ],
  );

  return <PrivyAuthContext.Provider value={value}>{children}</PrivyAuthContext.Provider>;
}
