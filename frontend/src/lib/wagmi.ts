/**
 * wagmi.ts
 * Wagmi v3 configuration — MetaMask first, Hedera EVM relay primary.
 *
 * Chain priority:
 *   1. hederaTestnet (chainId 296) — Hedera JSON-RPC relay, default for all
 *      KAI token operations (mint, transfer, vault, pool)
 *   2. sepolia (chainId 11155111)  — Ethereum Sepolia, for legacy ERC-20 ops
 *   3. mainnet / hedera mainnet    — production, configured but not active
 *
 * Connectors:
 *   1. MetaMask (injected, targeted) — primary EVM wallet
 *   2. injected (generic)           — catches Rabby, Frame, Brave, any EIP-1193
 *   3. WalletConnect                — enables HashPack via WalletConnect protocol
 *      HashPack supports WalletConnect v2 — users scan QR or use deep link
 *
 * The Hedera JSON-RPC relay (hashio.io) lets MetaMask interact with Hedera
 * as if it were any EVM chain. MetaMask never needs to know about HTS/HCS —
 * those go through hederaClient.ts (server-side SDK) or hashconnectClient.ts.
 */

import { http, createConfig } from 'wagmi';
import { sepolia, mainnet, hederaTestnet, hedera } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

// ── RPC endpoints ─────────────────────────────────────────────────────────────

const sepoliaRpc = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

// Hedera JSON-RPC relay — the bridge between MetaMask/EVM tooling and Hedera
const hederaTestnetRelay =
  process.env.NEXT_PUBLIC_HEDERA_RPC_URL || 'https://testnet.hashio.io/api';

// WalletConnect project ID — used for both generic WC and HashPack
const wcProjectId =
  process.env.NEXT_PUBLIC_HASHCONNECT_PROJECT_ID || 'f63851554285ee5785f0645981c49bf3';

// ── Wagmi config ──────────────────────────────────────────────────────────────

export const config = createConfig({
  // hederaTestnet first = default chain for wallet_switchEthereumChain prompts
  chains: [hederaTestnet, sepolia, mainnet, hedera],
  connectors: [
    // 1. MetaMask — explicitly targeted so it always appears even when other
    //    injected wallets are present
    injected({
      target: 'metaMask',
    }),

    // 2. Generic injected — catches Rabby, Brave, Frame, Coinbase Wallet, etc.
    //    (MetaMask users who connect via the generic button also land here)
    injected(),

    // 3. WalletConnect — enables HashPack (and any other WC v2 wallet)
    //    HashPack on mobile / browser extension supports WalletConnect v2.
    //    Users see a QR code or a deep-link button.
    walletConnect({
      projectId: wcProjectId,
      metadata: {
        name:        'KAI Nuvari',
        description: 'AI-Native DeFi & Conservation Payments on Hedera + Ethereum',
        url:         typeof window !== 'undefined' ? window.location.origin : 'https://kai-nuvari.app',
        icons:       ['https://kai-nuvari.vercel.app/favicon.ico'],
      },
      showQrModal: true,
    }),
  ],
  ssr: true,
  transports: {
    // Hedera testnet via JSON-RPC relay (MetaMask talks to Hedera through this)
    [hederaTestnet.id]: http(hederaTestnetRelay),
    // Sepolia
    [sepolia.id]: http(sepoliaRpc),
    // Mainnets — no custom RPC, use defaults
    [mainnet.id]:        http(),
    [hedera.id]:         http('https://mainnet.hashio.io/api'),
  },
});

// ── Re-export chain IDs for convenience ───────────────────────────────────────

export const HEDERA_TESTNET_ID = hederaTestnet.id;  // 296
export const SEPOLIA_ID        = sepolia.id;          // 11155111
export const HEDERA_MAINNET_ID = hedera.id;           // 295
