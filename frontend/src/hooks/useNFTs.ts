'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePrivyAuth } from '@/lib/privy-auth';

export interface NFTItem {
  name: string;
  collection: string;
  tokenId: string;
  image: string | null;
  contract: string;
}

/**
 * Fetches NFTs owned by the current wallet from /api/nft (PRD 1 §11).
 * Tries on-chain detection via Reservoir, SimpleHash, or eth_getLogs.
 */
export function useNFTs() {
  const { address, authenticated, ready } = usePrivyAuth();
  const [nfts, setNfts] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>('none');

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nft?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      setNfts(data.nfts ?? []);
      setSource(data.source ?? 'none');
    } catch {
      setNfts([]);
      setSource('error');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (ready && authenticated && address) load();
  }, [ready, authenticated, address, load]);

  return { nfts, loading, source, reload: load };
}
