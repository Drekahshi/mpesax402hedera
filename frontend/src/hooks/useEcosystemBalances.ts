'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { formatUnits } from 'viem';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/erc20abi';
import { useKaiStore } from '@/store/useKaiStore';
import { getHtsPortfolio } from '@/lib/hederaTokens';

export function useEcosystemBalances() {
  const { address, isConnected, chainId } = useAccount();
  const setNativeBalance = useKaiStore(s => s.setNativeBalance);
  const setAllBalances = useKaiStore(s => s.setAllBalances);
  const storeBalances = useKaiStore(s => s.balances);
  const accountId = useKaiStore(s => s.accountId);
  const hashpackAccountId = useKaiStore(s => s.hashpackAccountId);

  const [htsLoading, setHtsLoading] = useState(false);
  const [htsBalances, setHtsBalances] = useState<Record<string, number>>({});
  const [htsHbar, setHtsHbar] = useState<number>(0);

  // Determine active Hedera account ID
  const activeHederaAccount = useMemo(() => {
    if (hashpackAccountId && /^\d+\.\d+\.\d+$/.test(hashpackAccountId)) return hashpackAccountId;
    if (accountId && /^\d+\.\d+\.\d+$/.test(accountId)) return accountId;
    // Default fallback to user account
    return '0.0.5883612';
  }, [hashpackAccountId, accountId]);

  // Fetch Hedera Mirror Node HTS balances
  const fetchHederaBalances = useCallback(async (accId?: string) => {
    const target = accId || activeHederaAccount;
    if (!target) return;
    try {
      setHtsLoading(true);
      const portfolio = await getHtsPortfolio(target);
      setHtsHbar(portfolio.hbar);
      const map: Record<string, number> = {};
      portfolio.tokens.forEach(t => {
        // Support both exact symbol and uppercase
        const sym = t.symbol;
        map[sym] = t.balance;
        map[sym.toLowerCase()] = t.balance;
        if (sym === 'YBOB' || sym === 'yBOB') {
          map['yBOB'] = t.balance;
          map['YBOB'] = t.balance;
        }
      });
      setHtsBalances(map);
      setNativeBalance(portfolio.hbar);
      setAllBalances({
        hbar: portfolio.hbar,
        eth: portfolio.hbar,
        nvr: map.nvr ?? map.NVR ?? 0,
        ybob: map.ybob ?? map.yBOB ?? map.YBOB ?? 0,
        ytoken: map.ytoken ?? map.YTOKEN ?? 0,
        ygold: map.ygold ?? map.YGOLD ?? 0,
        gami: map.gami ?? map.GAMI ?? 0,
        cents: map.cents ?? map.CENTS ?? 0,
        kbar: map.kbar ?? map.KBAR ?? 0,
      });
    } catch (err) {
      console.warn('[useEcosystemBalances] Hedera portfolio fetch note:', err);
    } finally {
      setHtsLoading(false);
    }
  }, [activeHederaAccount, setNativeBalance, setAllBalances]);

  // Initial and reactive Hedera fetch
  useEffect(() => {
    fetchHederaBalances(activeHederaAccount);
  }, [activeHederaAccount, fetchHederaBalances]);

  // Wagmi balance queries (for EVM addresses)
  const {
    data: ethBalance,
    refetch: refetchNative,
    isFetching: ethLoading,
  } = useBalance({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });

  const deployed = ECOSYSTEM_TOKENS.filter(token => token.address);
  const { data: tokenData, refetch: refetchTokens, isFetching: tokensLoading } = useReadContracts({
    contracts: address
      ? deployed.map(token => ({
          address: token.address as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'balanceOf' as const,
          args: [address] as const,
          chainId: sepolia.id,
        }))
      : [],
    query: { enabled: Boolean(address) && deployed.length > 0 },
  });

  // Calculate merged token balances
  const tokenBalances = useMemo(() => {
    return ECOSYSTEM_TOKENS.reduce<Record<string, number>>((acc, token) => {
      const idx = deployed.findIndex(item => item.symbol === token.symbol);
      const result = idx >= 0 ? tokenData?.[idx] : undefined;
      const onChainEVM = result?.status === 'success' && result.result !== undefined
        ? Number(formatUnits(result.result as bigint, token.decimals))
        : 0;

      const htsVal = htsBalances[token.symbol] ?? htsBalances[token.symbol.toUpperCase()] ?? htsBalances[token.symbol.toLowerCase()] ?? 0;
      const key = token.symbol.toLowerCase() as keyof typeof storeBalances;
      const storeVal = storeBalances[key] || 0;

      // Choose highest valid source: EVM onchain > Hedera HTS > local store
      const finalVal = onChainEVM > 0 ? onChainEVM : htsVal > 0 ? htsVal : storeVal;
      acc[token.symbol] = finalVal;
      if (token.symbol === 'yBOB') {
        acc['YBOB'] = finalVal;
      }
      return acc;
    }, {});
  }, [deployed, tokenData, htsBalances, storeBalances]);

  const ethAmt = ethBalance
    ? Number(formatUnits(ethBalance.value, ethBalance.decimals))
    : (htsHbar || storeBalances.hbar || storeBalances.eth || 0);

  useEffect(() => {
    if (ethBalance) setNativeBalance(ethAmt);
  }, [ethAmt, ethBalance, setNativeBalance]);

  const holdings = useMemo(() => [
    {
      symbol: 'HBAR',
      name: 'Hedera Native Gas',
      value: htsHbar || storeBalances.hbar || ethAmt,
      color: '#00ea90',
      role: 'Native Hedera network gas',
      deployed: true,
      address: null as `0x${string}` | null,
    },
    ...ECOSYSTEM_TOKENS.map(token => ({
      symbol: token.symbol,
      name: token.name,
      value: tokenBalances[token.symbol] ?? 0,
      color: token.color,
      role: token.role,
      deployed: Boolean(token.address || token.htsTokenId),
      address: token.address,
    })),
  ], [htsHbar, storeBalances.hbar, ethAmt, tokenBalances]);

  const refresh = async () => {
    await Promise.allSettled([refetchNative(), refetchTokens(), fetchHederaBalances()]);
  };

  return {
    address,
    isConnected,
    chainId,
    onSepolia: chainId === sepolia.id,
    holdings,
    ethAmt,
    tokenBalances,
    loading: ethLoading || tokensLoading || htsLoading,
    refresh,
    deployedCount: ECOSYSTEM_TOKENS.length,
  };
}
