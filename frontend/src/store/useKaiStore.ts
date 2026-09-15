import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TokenBalances {
  eth:    number;   // native ETH/HBAR gas balance
  hbar:   number;   // Hedera HBAR balance
  nvr:    number;   // NVR governance token
  ybob:   number;   // yBOB stable token
  ytoken: number;   // Y Token ETF
  ygold:  number;   // YGold ETF
  gami:   number;   // GAMI rewards token
  cents:  number;   // Nuvari cents token
  kbar:   number;   // KAIBAR utility token
}

interface KaiState {
  // Wallet state
  connected:          boolean;
  walletType:         'metamask' | 'core' | 'hashpack' | null;
  accountId:          string; // EVM address (0x) or Hedera Account ID (0.0.x)
  hashpackAccountId?: string;

  // Balances
  balances: TokenBalances;

  // Misc
  autoMineActive: boolean;

  // Actions
  connectWallet:    (type: 'metamask' | 'core' | 'hashpack', address: string) => void;
  disconnectWallet: () => void;
  setNativeBalance: (amount: number) => void;
  setTokenBalance:  (token: keyof TokenBalances, value: number) => void;
  setAllBalances:   (balances: Partial<TokenBalances>) => void;
  toggleAutoMine:   () => void;
  claimFaucet:      (address?: string) => Promise<{ success: boolean; message: string; dispensed?: any }>;
  swapTokens:       (fromToken: string, toToken: string, amount: number, recipient?: string) => Promise<{ success: boolean; toAmount: number; txId: string; error?: string }>;
}

const DEFAULT_BALANCES: TokenBalances = {
  eth: 0,
  hbar: 0,
  nvr: 0,
  ybob: 0,
  ytoken: 0,
  ygold: 0,
  gami: 0,
  cents: 0,
  kbar: 0,
};

export const useKaiStore = create<KaiState>()(
  persist(
    (set, get) => ({
      connected:          false,
      walletType:         null,
      accountId:          '',
      hashpackAccountId:  undefined,
      balances:           { ...DEFAULT_BALANCES },
      autoMineActive:     false,

      connectWallet: (type, address) =>
        set({
          connected: true,
          walletType: type,
          accountId: address,
          hashpackAccountId: type === 'hashpack' ? address : get().hashpackAccountId,
        }),

      disconnectWallet: () =>
        set({
          connected: false,
          walletType: null,
          accountId: '',
          hashpackAccountId: undefined,
        }),

      setNativeBalance: (amount) =>
        set((s) => ({
          balances: {
            ...s.balances,
            eth: amount,
            hbar: amount,
          },
        })),

      setTokenBalance: (token, value) =>
        set((s) => ({ balances: { ...s.balances, [token]: value } })),

      setAllBalances: (incoming) =>
        set((s) => ({
          balances: {
            ...s.balances,
            ...incoming,
            // Keep hbar and eth in sync if one is updated
            hbar: incoming.hbar ?? incoming.eth ?? s.balances.hbar,
            eth: incoming.eth ?? incoming.hbar ?? s.balances.eth,
          },
        })),

      toggleAutoMine: () =>
        set((s) => ({ autoMineActive: !s.autoMineActive })),

      claimFaucet: async (overrideAddress?: string) => {
        const addr = overrideAddress || get().accountId || '0.0.5834216';
        try {
          const res = await fetch('/api/faucet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: addr }),
          });
          const data = await res.json();
          if (data.success && data.dispensed) {
            const cur = get().balances;
            const updated: TokenBalances = {
              eth: (cur.eth || 0) + (data.dispensed.hbar || 5),
              hbar: (cur.hbar || 0) + (data.dispensed.hbar || 5),
              nvr: (cur.nvr || 0) + (data.dispensed.nvr || 5000),
              ybob: (cur.ybob || 0) + (data.dispensed.ybob || 5000),
              ytoken: (cur.ytoken || 0) + (data.dispensed.ytoken || 2500),
              ygold: (cur.ygold || 0) + (data.dispensed.ygold || 1500),
              gami: (cur.gami || 0) + (data.dispensed.gami || 8000),
              cents: (cur.cents || 0) + (data.dispensed.cents || 10000),
              kbar: (cur.kbar || 0) + (data.dispensed.kbar || 2000),
            };
            set({ balances: updated });
            return { success: true, message: data.message || 'Tokens claimed!', dispensed: data.dispensed };
          }
          return { success: false, message: data.error || 'Failed to claim tokens on Hedera Testnet' };
        } catch (e: any) {
          return { success: false, message: e?.message || 'Network error claiming faucet' };
        }
      },

      swapTokens: async (fromToken: string, toToken: string, amount: number, recipient?: string) => {
        const addr = recipient || get().accountId || '0.0.5834216';
        try {
          const res = await fetch('/api/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromToken,
              toToken,
              fromAmount: amount,
              recipient: addr,
            }),
          });
          const data = await res.json();
          if (data.success) {
            const fromKey = fromToken.toLowerCase() as keyof TokenBalances;
            const toKey = toToken.toLowerCase() as keyof TokenBalances;
            const cur = get().balances;

            const newFrom = Math.max(0, (cur[fromKey] || 0) - amount);
            const newTo = (cur[toKey] || 0) + data.toAmount;

            set((s) => ({
              balances: {
                ...s.balances,
                [fromKey]: newFrom,
                [toKey]: newTo,
                ...(fromKey === 'hbar' ? { eth: newFrom } : {}),
                ...(fromKey === 'eth' ? { hbar: newFrom } : {}),
                ...(toKey === 'hbar' ? { eth: newTo } : {}),
                ...(toKey === 'eth' ? { hbar: newTo } : {}),
              },
            }));

            return {
              success: true,
              toAmount: data.toAmount,
              txId: data.txId,
            };
          }
          return { success: false, toAmount: 0, txId: '', error: data.error || 'Swap failed' };
        } catch (e: any) {
          return { success: false, toAmount: 0, txId: '', error: e?.message || 'Network error' };
        }
      },
    }),
    {
      name: 'kai-store-v2',
      partialize: (state) => ({
        balances: state.balances,
        accountId: state.accountId,
        walletType: state.walletType,
      }),
    }
  )
);
