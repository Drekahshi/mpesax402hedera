/**
 * mirrorNode.ts
 * Hedera Mirror Node read layer — Phase 1 of the Hedera-native rails.
 *
 * All balance/history/token-info queries should go through here rather than
 * querying consensus nodes directly. Mirror Node is free, fast, and REST-based.
 *
 * Exports:
 *   getAccountInfo()          — account HBAR balance + metadata
 *   getHtsTokenBalances()     — all HTS token balances for an account
 *   getTokenInfo()            — token metadata (name, symbol, decimals, supply)
 *   getNftInfo()              — single NFT serial metadata
 *   getNftsForAccount()       — all NFT serials held by an account
 *   getTransactionHistory()   — recent transactions for an account
 *   getHcsMessages()          — recent HCS topic messages
 *   healthCheck()             — ping the mirror node
 *
 * Env vars used (NEXT_PUBLIC_ prefix → available in browser):
 *   NEXT_PUBLIC_HEDERA_MIRROR_NODE_URL  (default: testnet)
 */

const MIRROR_BASE =
  process.env.NEXT_PUBLIC_HEDERA_MIRROR_NODE_URL ??
  'https://testnet.mirrornode.hedera.com';

const API = `${MIRROR_BASE}/api/v1`;

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function _get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    next: { revalidate: 15 }, // Next.js ISR — 15s cache for balance reads
    headers: { 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`[MirrorNode] ${path} → HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ── Account info ──────────────────────────────────────────────────────────────

export interface MirrorAccountInfo {
  accountId: string;
  balance: {
    hbars: number;        // in HBAR (divided by 1e8 from tinybar)
    tinybar: number;
    tokens: Array<{ tokenId: string; balance: number }>;
  };
  evmAddress: string | null;
  createdAt: string;
  memo: string;
}

interface RawAccountInfo {
  account: string;
  balance?: { balance?: number; tokens?: Array<{ token_id: string; balance: number }> };
  evm_address?: string | null;
  created_timestamp?: string;
  memo?: string;
}

export async function getAccountInfo(accountId: string): Promise<MirrorAccountInfo> {
  const data = await _get<RawAccountInfo>(`/accounts/${accountId}`);

  return {
    accountId: data.account,
    balance: {
      tinybar: data.balance?.balance ?? 0,
      hbars: (data.balance?.balance ?? 0) / 1e8,
      tokens: (data.balance?.tokens ?? []).map((t) => ({
        tokenId: t.token_id,
        balance: t.balance,
      })),
    },
    evmAddress: data.evm_address ?? null,
    createdAt: data.created_timestamp ?? '',
    memo: data.memo ?? '',
  };
}

// ── HTS token balances ────────────────────────────────────────────────────────

export interface HtsTokenBalance {
  tokenId: string;
  balance: number;
  decimals: number;
  symbol: string;
  name: string;
}

/**
 * Returns all HTS token balances for an account, enriched with token metadata.
 * Suitable for the portfolio dashboard.
 */
interface RawTokenBalanceItem {
  token_id: string;
  balance: number;
  decimals?: number;
}

export async function getHtsTokenBalances(accountId: string): Promise<HtsTokenBalance[]> {
  const data = await _get<{ tokens?: RawTokenBalanceItem[] }>(`/accounts/${accountId}/tokens`, { limit: '100' });
  const items: RawTokenBalanceItem[] = data.tokens ?? [];

  // Fetch token metadata in parallel (with concurrency cap)
  const results = await Promise.allSettled(
    items.map(async (item) => {
      let symbol   = item.token_id;
      let name     = item.token_id;
      let decimals = typeof item.decimals === 'number' ? item.decimals : 0;
      try {
        const meta = await getTokenInfo(item.token_id);
        symbol   = meta.symbol || symbol;
        name     = meta.name || name;
        if (typeof meta.decimals === 'number') decimals = meta.decimals;
      } catch {
        // token metadata unavailable — use defaults
      }
      return {
        tokenId:  item.token_id,
        balance:  item.balance,
        decimals,
        symbol,
        name,
      } satisfies HtsTokenBalance;
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<HtsTokenBalance> => r.status === 'fulfilled')
    .map(r => r.value);
}

// ── Token metadata ────────────────────────────────────────────────────────────

export interface TokenInfo {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  maxSupply: string;
  supplyType: 'INFINITE' | 'FINITE';
  tokenType: 'FUNGIBLE_COMMON' | 'NON_FUNGIBLE_UNIQUE';
  treasuryAccountId: string;
  createdAt: string;
  memo: string;
}

interface RawTokenInfo {
  token_id: string;
  name: string;
  symbol: string;
  decimals: string | number;
  total_supply: string;
  max_supply: string;
  supply_type: 'INFINITE' | 'FINITE';
  type: 'FUNGIBLE_COMMON' | 'NON_FUNGIBLE_UNIQUE';
  treasury_account_id: string;
  created_timestamp: string;
  memo?: string;
}

export async function getTokenInfo(tokenId: string): Promise<TokenInfo> {
  const data = await _get<RawTokenInfo>(`/tokens/${tokenId}`);
  return {
    tokenId:           data.token_id,
    name:              data.name,
    symbol:            data.symbol,
    decimals:          Number(data.decimals),
    totalSupply:       data.total_supply,
    maxSupply:         data.max_supply,
    supplyType:        data.supply_type,
    tokenType:         data.type,
    treasuryAccountId: data.treasury_account_id,
    createdAt:         data.created_timestamp,
    memo:              data.memo ?? '',
  };
}

// ── NFT info ──────────────────────────────────────────────────────────────────

export interface NftInfo {
  tokenId: string;
  serialNumber: number;
  accountId: string;
  metadata: string;       // base64-encoded on the mirror node; decoded here to UTF-8
  createdAt: string;
  spenderId: string | null;
}

interface RawNftItem {
  token_id: string;
  serial_number: number;
  account_id: string;
  metadata: string | null;
  created_timestamp: string;
  spender?: string | null;
}

export async function getNftInfo(tokenId: string, serialNumber: number): Promise<NftInfo> {
  const data = await _get<RawNftItem>(`/tokens/${tokenId}/nfts/${serialNumber}`);
  return {
    tokenId:      data.token_id,
    serialNumber: data.serial_number,
    accountId:    data.account_id,
    metadata:     _decodeMetadata(data.metadata),
    createdAt:    data.created_timestamp,
    spenderId:    data.spender ?? null,
  };
}

/**
 * Returns all NFT serials of a given token held by an account.
 */
export async function getNftsForAccount(
  accountId: string,
  tokenId?: string,
): Promise<NftInfo[]> {
  const params: Record<string, string> = { limit: '100' };
  if (tokenId) params['token.id'] = tokenId;

  const data = await _get<{ nfts?: RawNftItem[] }>(`/accounts/${accountId}/nfts`, params);
  const items: RawNftItem[] = data.nfts ?? [];

  return items.map((item) => ({
    tokenId:      item.token_id,
    serialNumber: item.serial_number,
    accountId:    item.account_id,
    metadata:     _decodeMetadata(item.metadata),
    createdAt:    item.created_timestamp,
    spenderId:    item.spender ?? null,
  }));
}

// ── Transaction history ───────────────────────────────────────────────────────

export interface MirrorTransaction {
  transactionId: string;
  type: string;
  result: string;
  consensusTimestamp: string;
  memo: string;
  transfers: Array<{ account: string; amount: number; isApproval: boolean }>;
  tokenTransfers: Array<{ tokenId: string; account: string; amount: number }>;
  nftTransfers: Array<{ tokenId: string; serialNumber: number; senderAccountId: string; receiverAccountId: string }>;
}

interface RawTransaction {
  transaction_id: string;
  name: string;
  result: string;
  consensus_timestamp: string;
  memo_base64?: string | null;
  transfers?: Array<{ account: string; amount: number; is_approval?: boolean }>;
  token_transfers?: Array<{ token_id: string; account: string; amount: number }>;
  nft_transfers?: Array<{ token_id: string; serial_number: number; sender_account_id: string; receiver_account_id: string }>;
}

export async function getTransactionHistory(
  accountId: string,
  limit = 25,
): Promise<MirrorTransaction[]> {
  const data = await _get<{ transactions?: RawTransaction[] }>(`/transactions`, {
    'account.id': accountId,
    limit: String(limit),
    order: 'desc',
  });

  return (data.transactions ?? []).map((tx) => ({
    transactionId:      tx.transaction_id,
    type:               tx.name,
    result:             tx.result,
    consensusTimestamp: tx.consensus_timestamp,
    memo:               tx.memo_base64
      ? Buffer.from(tx.memo_base64, 'base64').toString('utf-8')
      : '',
    transfers: (tx.transfers ?? []).map((t) => ({
      account:    t.account,
      amount:     t.amount,
      isApproval: t.is_approval ?? false,
    })),
    tokenTransfers: (tx.token_transfers ?? []).map((t) => ({
      tokenId: t.token_id,
      account: t.account,
      amount:  t.amount,
    })),
    nftTransfers: (tx.nft_transfers ?? []).map((t) => ({
      tokenId:           t.token_id,
      serialNumber:      t.serial_number,
      senderAccountId:   t.sender_account_id,
      receiverAccountId: t.receiver_account_id,
    })),
  }));
}

// ── HCS topic messages ────────────────────────────────────────────────────────

export interface HcsMessage {
  sequenceNumber: number;
  consensusTimestamp: string;
  message: string;   // decoded UTF-8
  runningHash: string;
  topicId: string;
}

/**
 * Fetch the latest messages from an HCS topic.
 * Used by the audit trail viewer.
 */
export async function getHcsMessages(
  topicId: string,
  limit = 25,
): Promise<HcsMessage[]> {
  interface RawHcsMessage {
    sequence_number: number;
    consensus_timestamp: string;
    message: string;
    running_hash: string;
    topic_id: string;
  }

  const data = await _get<{ messages?: RawHcsMessage[] }>(`/topics/${topicId}/messages`, {
    limit: String(limit),
    order: 'desc',
  });

  return (data.messages ?? []).map((m) => ({
    sequenceNumber:     m.sequence_number,
    consensusTimestamp: m.consensus_timestamp,
    message:            _decodeMetadata(m.message),
    runningHash:        m.running_hash,
    topicId:            m.topic_id,
  }));
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function mirrorNodeHealthCheck(): Promise<{ ok: boolean; network: string }> {
  try {
    await _get('/network/supply');
    return { ok: true, network: MIRROR_BASE };
  } catch {
    return { ok: false, network: MIRROR_BASE };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _decodeMetadata(b64: string | null | undefined): string {
  if (!b64) return '';
  try {
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return b64;
  }
}
