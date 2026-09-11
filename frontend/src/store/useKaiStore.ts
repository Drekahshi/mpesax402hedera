import { create } from 'zustand';

interface TokenBalances {
  eth:   number;   // native ETH/HBAR gas balance
  nvr:    number;   // NVR governance token
  ybob:   number;   // yBOB stable token
  ytoken: number;   // Y Token ETF
  ygold:  number;   // YGold ETF
  gami:   number;   // GAMI rewards token
  cents:  number;   // Nuvari cents token
}

interface KaiState {
  // Wallet state (MetaMask / Web3 Wallets via Wagmi)
  connected:  boolean;
  walletType: 'metamask' | 'core' | null;
  accountId:  string; // 0x EVM address

  // Balances
  balances: TokenBalances;

  // Misc
  autoMineActive: boolean;

  // Actions
  connectWallet:    (type: 'metamask' | 'core', address: string) => void;
  disconnectWallet: () => void;
  setNativeBalance:   (eth: number) => void;
  setTokenBalance:  (token: keyof Omit<TokenBalances, 'eth'>, value: number) => void;
  setAllBalances:   (balances: Partial<TokenBalances>) => void;
  toggleAutoMine:   () => void;
}

const ZERO_BALANCES: TokenBalances = { eth: 0, nvr: 0, ybob: 0, ytoken: 0, ygold: 0, gami: 0, cents: 0 };

export const useKaiStore = create<KaiState>((set) => ({
  connected:      false,
  walletType:     null,
  accountId:      '',
  balances:       { ...ZERO_BALANCES },
  autoMineActive: false,

  connectWallet:    (type, address) =>
    set({ connected: true, walletType: type, accountId: address }),

  disconnectWallet: () =>
    set({ connected: false, walletType: null, accountId: '', balances: { ...ZERO_BALANCES } }),

  setNativeBalance: (eth) =>
    set((s) => ({ balances: { ...s.balances, eth } })),

  setTokenBalance: (token, value) =>
    set((s) => ({ balances: { ...s.balances, [token]: value } })),

  setAllBalances: (incoming) =>
    set((s) => ({ balances: { ...s.balances, ...incoming } })),

  toggleAutoMine: () =>
    set((s) => ({ autoMineActive: !s.autoMineActive })),
}));
