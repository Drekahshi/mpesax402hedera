/**
 * hederaNetwork.ts
 * Utilities for adding Hedera networks to MetaMask and switching chains.
 *
 * The Hedera JSON-RPC relay (hashio.io) exposes Hedera as a standard EVM
 * JSON-RPC endpoint, so MetaMask can interact with it exactly like Sepolia
 * or any other EVM chain — including signing transactions and reading state.
 *
 * Usage:
 *   await addHederaTestnetToMetaMask()   // adds the chain if not present
 *   await switchToHederaTestnet()        // switches MetaMask to Hedera testnet
 *   await switchToSepolia()              // switches back to Sepolia
 *   getCurrentChainId()                  // returns current chain as number
 */

// ── Hedera chain definitions (EIP-3085 wallet_addEthereumChain format) ────────

export const HEDERA_TESTNET_CHAIN = {
  chainId:         '0x128',        // 296 in hex
  chainName:       'Hedera Testnet',
  nativeCurrency:  { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls:         ['https://testnet.hashio.io/api'],
  blockExplorerUrls: ['https://hashscan.io/testnet'],
  iconUrls:        ['https://hedera.com/favicon.ico'],
} as const;

export const HEDERA_MAINNET_CHAIN = {
  chainId:         '0x127',        // 295 in hex
  chainName:       'Hedera Mainnet',
  nativeCurrency:  { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls:         ['https://mainnet.hashio.io/api'],
  blockExplorerUrls: ['https://hashscan.io/mainnet'],
  iconUrls:        ['https://hedera.com/favicon.ico'],
} as const;

export const SEPOLIA_CHAIN = {
  chainId:         '0xaa36a7',     // 11155111 in hex
  chainName:       'Ethereum Sepolia',
  nativeCurrency:  { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls:         ['https://rpc.sepolia.org'],
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
} as const;

// ── Chain IDs ─────────────────────────────────────────────────────────────────

export const CHAIN_IDS = {
  hederaTestnet: 296,
  hederaMainnet: 295,
  sepolia:       11155111,
  mainnet:       1,
} as const;

// ── MetaMask helpers ──────────────────────────────────────────────────────────

interface Eip1193Provider {
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function getProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  // MetaMask injects window.ethereum; some wallets use window.ethereum.providers[]
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) return null;
  // If multiple wallets injected, find MetaMask specifically
  if (eth.providers?.length) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth;
  }
  return eth;
}

/**
 * Add Hedera Testnet to MetaMask.
 * If already added, MetaMask silently ignores the request.
 */
export async function addHederaTestnetToMetaMask(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not detected');
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [HEDERA_TESTNET_CHAIN],
  });
}

/**
 * Add Hedera Mainnet to MetaMask.
 */
export async function addHederaMainnetToMetaMask(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not detected');
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [HEDERA_MAINNET_CHAIN],
  });
}

/**
 * Switch MetaMask to Hedera Testnet.
 * Adds the chain first if MetaMask doesn't know about it yet.
 */
export async function switchToHederaTestnet(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not detected');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: HEDERA_TESTNET_CHAIN.chainId }],
    });
  } catch (err: any) {
    // 4902 = chain not added yet
    if (err?.code === 4902) {
      await addHederaTestnetToMetaMask();
    } else {
      throw err;
    }
  }
}

/**
 * Switch MetaMask to Ethereum Sepolia.
 */
export async function switchToSepolia(): Promise<void> {
  const provider = getProvider();
  if (!provider) throw new Error('MetaMask not detected');
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN.chainId }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_CHAIN],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Get the current chain ID from MetaMask.
 * Returns the chain ID as a number, or null if MetaMask not connected.
 */
export async function getCurrentChainId(): Promise<number | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const hex = await provider.request({ method: 'eth_chainId' });
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/**
 * Returns true if MetaMask is currently on Hedera Testnet.
 */
export async function isOnHederaTestnet(): Promise<boolean> {
  const id = await getCurrentChainId();
  return id === CHAIN_IDS.hederaTestnet;
}

/**
 * Returns true if MetaMask is currently on Sepolia.
 */
export async function isOnSepolia(): Promise<boolean> {
  const id = await getCurrentChainId();
  return id === CHAIN_IDS.sepolia;
}

/**
 * Subscribe to chain changes in MetaMask.
 * Returns an unsubscribe function.
 */
export function onChainChange(callback: (chainId: number) => void): () => void {
  const provider = getProvider();
  if (!provider) return () => {};
  const handler = (hex: string) => callback(parseInt(hex, 16));
  provider.on('chainChanged', handler);
  return () => provider.removeListener?.('chainChanged', handler);
}

/**
 * Human-readable chain name.
 */
export function chainName(chainId: number): string {
  switch (chainId) {
    case 296:     return 'Hedera Testnet';
    case 295:     return 'Hedera Mainnet';
    case 11155111: return 'Ethereum Sepolia';
    case 1:       return 'Ethereum Mainnet';
    default:      return `Chain ${chainId}`;
  }
}
