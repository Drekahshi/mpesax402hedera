import { NextResponse } from 'next/server';

/**
 * /api/nft  —  GET
 *
 * Fetches NFTs owned by an Ethereum & Hedera wallet address. Tries multiple sources
 * in order of reliability:
 *
 *   1. Reservoir API (public, no key required for reads)
 *   2. SimpleHash (public tier)
 *   3. eth_getLogs fallback (scan ERC-721 Transfer events)
 *
 * Returns a normalized list of { name, collection, tokenId, image, contract }.
 */

interface NFTItem {
  name: string;
  collection: string;
  tokenId: string;
  image: string | null;
  contract: string;
}

const SEPOLIA_RPC = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';

// ── Source 1: Reservoir ──
async function fetchFromReservoir(address: string): Promise<NFTItem[]> {
  try {
    const res = await fetch(
      `https://api.reservoir.tools/api/v7/mainnet/sepolia/tokens/v7?owner=${address}&limit=50`,
      { headers: { accept: 'application/json' }, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      tokens?: { token?: { name?: string; tokenId?: string; image?: string; media?: string; contract?: string; collection?: { name?: string } } }[];
    };
    const tokens = data?.tokens ?? [];
    return tokens.map((t) => ({
      name: t.token?.name || `#${t.token?.tokenId ?? '?'}`,
      collection: t.token?.collection?.name || 'Unknown',
      tokenId: String(t.token?.tokenId ?? ''),
      image: t.token?.image || t.token?.media || null,
      contract: t.token?.contract ?? '',
    }));
  } catch {
    return [];
  }
}

// ── Source 2: SimpleHash ──
async function fetchFromSimpleHash(address: string): Promise<NFTItem[]> {
  try {
    const res = await fetch(
      `https://api.simplehash.com/api/v0/nfts/owners?chains=mainnet&wallet_addresses=${address}&limit=50`,
      { headers: { accept: 'application/json' }, next: { revalidate: 300 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      nfts?: { name?: string; token_id?: string; image_url?: string; contract_address?: string; previews?: { image_medium_url?: string }; collection?: { name?: string } }[];
    };
    const nfts = data?.nfts ?? [];
    return nfts.map((n) => ({
      name: n.name || `#${n.token_id ?? '?'}`,
      collection: n.collection?.name || 'Unknown',
      tokenId: String(n.token_id ?? ''),
      image: n.image_url || n.previews?.image_medium_url || null,
      contract: n.contract_address ?? '',
    }));
  } catch {
    return [];
  }
}

// ── Source 3: eth_getLogs ERC-721 Transfer scan ──
// Scans recent blocks for Transfer events TO the user's address on known
// ERC-721 contracts. Returns owned token IDs by subtracting outgoing.
async function fetchFromLogs(address: string): Promise<NFTItem[]> {
  try {
    // Well-known NFT contracts on Sepolia / Hedera Testnet (add more as deployed)
    const knownContracts = [
      process.env.NEXT_PUBLIC_CONSERVATION_NFT_ADDRESS,
    ].filter((c): c is string => !!c && /^0x[a-fA-F0-9]{40}$/.test(c));

    if (knownContracts.length === 0) return [];

    const ERC721_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const toTopic = `0x000000000000000000000000${address.slice(2).toLowerCase()}`;
    const fromTopic = `0x000000000000000000000000${address.slice(2).toLowerCase()}`;

    // Last ~100k blocks (~2 days on Sepolia)
    const blockRes = await fetch(SEPOLIA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    });
    const blockData = (await blockRes.json()) as { result?: string };
    const currentBlock = parseInt(blockData.result ?? '0', 16);
    const fromBlock = Math.max(currentBlock - 100000, 0);

    const owned = new Map<string, { contract: string; tokenId: string }>();

    for (const contractAddr of knownContracts) {
      // Transfers TO the user (incoming)
      const inRes = await fetch(SEPOLIA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
          params: [{
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: 'latest',
            address: contractAddr,
            topics: [ERC721_TRANSFER, null, toTopic],
          }],
        }),
      });
      const inData = (await inRes.json()) as { result?: { topics: string[] }[] };
      for (const log of inData?.result ?? []) {
        const tokenId = BigInt(log.topics[3]).toString();
        owned.set(`${contractAddr}-${tokenId}`, { contract: contractAddr, tokenId });
      }

      // Transfers FROM the user (outgoing — remove)
      const outRes = await fetch(SEPOLIA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 2, method: 'eth_getLogs',
          params: [{
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: 'latest',
            address: contractAddr,
            topics: [ERC721_TRANSFER, fromTopic, null],
          }],
        }),
      });
      const outData = (await outRes.json()) as { result?: { topics: string[] }[] };
      for (const log of outData?.result ?? []) {
        const tokenId = BigInt(log.topics[3]).toString();
        owned.delete(`${contractAddr}-${tokenId}`);
      }
    }

    return Array.from(owned.values()).map((o) => ({
      name: `Token #${o.tokenId}`,
      collection: 'Conservation NFT',
      tokenId: o.tokenId,
      image: null,
      contract: o.contract,
    }));
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address')?.trim();
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400 });
  }

  // Try sources in order, return the first with results.
  const sources = [fetchFromReservoir, fetchFromSimpleHash, fetchFromLogs];
  for (const source of sources) {
    const nfts = await source(address);
    if (nfts.length > 0) {
      return NextResponse.json({ nfts, source: source.name });
    }
  }

  return NextResponse.json({ nfts: [], source: 'none' });
}
