/**
 * hederaTokens.ts
 * Hedera HTS token ID registry + balance queries for HashPack users.
 *
 * When a user connects HashPack, use getHtsPortfolio() to show all 7
 * KAI token balances from the Hedera Mirror Node.
 */

import { getHtsTokenBalances, getAccountInfo } from './mirrorNode';

// ── HTS Token ID registry ─────────────────────────────────────────────────────

export const HTS_TOKENS = {
  NVR:   process.env.NEXT_PUBLIC_NVR_HTS_TOKEN_ID    ?? '0.0.10450060',
  YBOB:  process.env.NEXT_PUBLIC_YBOB_HTS_TOKEN_ID   ?? '0.0.10450061',
  YTOKEN: process.env.NEXT_PUBLIC_YTOKEN_HTS_TOKEN_ID ?? '0.0.10450063',
  YGOLD: process.env.NEXT_PUBLIC_YGOLD_HTS_TOKEN_ID   ?? '0.0.10450065',
  GAMI:  process.env.NEXT_PUBLIC_GAMI_HTS_TOKEN_ID    ?? '0.0.10450068',
  CENTS: process.env.NEXT_PUBLIC_CENTS_HTS_TOKEN_ID   ?? '0.0.10450070',
  KBAR:  process.env.NEXT_PUBLIC_KAIBAR_TOKEN_ID      ?? '0.0.10449901',
} as const;

export type HtsSymbol = keyof typeof HTS_TOKENS;

// ── Portfolio query ───────────────────────────────────────────────────────────

export interface HtsTokenBalance {
  symbol:    HtsSymbol | string;
  tokenId:   string;
  balance:   number;         // human-readable (divided by 10^decimals)
  rawBalance: number;
  decimals:  number;
  name:      string;
}

export interface HtsPortfolio {
  accountId:  string;
  hbar:       number;
  tokens:     HtsTokenBalance[];
  totalKaiTokens: number;
}

/**
 * Fetch all KAI HTS token balances for a HashPack account.
 * Uses the Mirror Node — no SDK key needed, works client-side.
 */
export async function getHtsPortfolio(accountId: string): Promise<HtsPortfolio> {
  const [accountInfo, allTokens] = await Promise.all([
    getAccountInfo(accountId),
    getHtsTokenBalances(accountId),
  ]);

  // Map token IDs to KAI symbols
  const tokenIdToSymbol = Object.fromEntries(
    Object.entries(HTS_TOKENS).map(([sym, id]) => [id, sym]),
  );

  const kaiTokens: HtsTokenBalance[] = allTokens
    .filter(t => tokenIdToSymbol[t.tokenId] !== undefined)
    .map(t => ({
      symbol:    tokenIdToSymbol[t.tokenId] as HtsSymbol,
      tokenId:   t.tokenId,
      balance:   t.balance / Math.pow(10, t.decimals),
      rawBalance: t.balance,
      decimals:  t.decimals,
      name:      t.name,
    }));

  // Fill in zeros for tokens not yet associated
  const presentIds = new Set(kaiTokens.map(t => t.tokenId));
  for (const [sym, id] of Object.entries(HTS_TOKENS)) {
    if (!presentIds.has(id)) {
      kaiTokens.push({
        symbol:    sym,
        tokenId:   id,
        balance:   0,
        rawBalance: 0,
        decimals:  sym === 'YBOB' || sym === 'CENTS' || sym === 'KBAR' ? 6 : 8,
        name:      sym,
      });
    }
  }

  const totalKaiTokens = kaiTokens.reduce((sum, t) => sum + t.balance, 0);

  return {
    accountId,
    hbar: accountInfo.balance.hbars,
    tokens: kaiTokens,
    totalKaiTokens,
  };
}

/**
 * Association check — returns which KAI tokens the account has NOT yet
 * associated. Users must associate a token before receiving it in HashPack.
 */
export async function getUnassociatedTokens(accountId: string): Promise<string[]> {
  const allTokens = await getHtsTokenBalances(accountId);
  const associated = new Set(allTokens.map(t => t.tokenId));
  return Object.entries(HTS_TOKENS)
    .filter(([, id]) => !associated.has(id))
    .map(([sym]) => sym);
}

/**
 * HashScan explorer URL for a token.
 */
export function hashscanTokenUrl(
  tokenId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  return `https://hashscan.io/${network}/token/${tokenId}`;
}

/**
 * HashScan explorer URL for an account.
 */
export function hashscanAccountUrl(
  accountId: string,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  return `https://hashscan.io/${network}/account/${accountId}`;
}

// ── HTS NFT Collection registry ───────────────────────────────────────────────

export const HTS_NFTS = {
  /** Conservation Event NFT — minted per verified tree planting / patrol / milestone */
  KCNFT: process.env.NEXT_PUBLIC_CONNFT_TOKEN_ID       ?? '0.0.10449914',
  /** KAI Agent Passport — one per registered AI agent (W3C DID on-chain) */
  KAIP:  process.env.NEXT_PUBLIC_KAIP_NFT_TOKEN_ID     ?? '0.0.10450239',
  /** KAI Membership — Bronze / Silver / Gold / Platinum tiers */
  KAIM:  process.env.NEXT_PUBLIC_KAIM_NFT_TOKEN_ID     ?? '0.0.10450242',
} as const;

export type NftSymbol = keyof typeof HTS_NFTS;

export const NFT_META: Record<NftSymbol, {
  name:        string;
  description: string;
  color:       string;
  tiers?:      string[];
}> = {
  KCNFT: {
    name:        'Conservation Event NFT',
    description: 'Minted for each verified conservation action — trees planted, forest patrols, CFA milestones',
    color:       '#22c55e',
  },
  KAIP: {
    name:        'KAI Agent Passport',
    description: 'On-chain W3C DID credential for registered KAI AI agents',
    color:       '#a78bfa',
  },
  KAIM: {
    name:        'KAI Membership NFT',
    description: 'Proof-of-membership for Chama, CFA, SACCO and SME participants',
    color:       '#f59e0b',
    tiers:       ['Bronze', 'Silver', 'Gold', 'Platinum'],
  },
};

/**
 * Fetch all KAI NFT serials held by a HashPack account.
 */
export async function getHtsNftsForAccount(accountId: string) {
  const { getNftsForAccount } = await import('./mirrorNode');
  const all = await getNftsForAccount(accountId);

  const kaiNftIds = new Set(Object.values(HTS_NFTS));
  const kaiNfts   = all.filter(nft => kaiNftIds.has(nft.tokenId));

  // Group by collection
  const byCollection: Record<string, typeof all> = {};
  for (const nft of kaiNfts) {
    const sym = Object.entries(HTS_NFTS).find(([, id]) => id === nft.tokenId)?.[0] ?? nft.tokenId;
    if (!byCollection[sym]) byCollection[sym] = [];
    byCollection[sym].push(nft);
  }

  return byCollection;
}

/**
 * HashScan NFT serial URL.
 */
export function hashscanNftUrl(
  tokenId: string,
  serialNumber: number,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  return `https://hashscan.io/${network}/token/${tokenId}/${serialNumber}`;
}
