'use client';

import { useEffect } from 'react';
import { useAccount, useBalance, useReadContracts } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { formatUnits } from 'viem';
import { ECOSYSTEM_TOKENS } from '@/lib/tokens';
import { ERC20_ABI } from '@/lib/erc20abi';
import { useKaiStore } from '@/store/useKaiStore';

export function useEcosystemBalances() {
  const { address, isConnected, chainId } = useAccount();
  const setNativeBalance = useKaiStore(s => s.setNativeBalance);
  const setAllBalances = useKaiStore(s => s.setAllBalances);

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

  const tokenBalances = ECOSYSTEM_TOKENS.reduce<Record<string, number>>((acc, token) => {
    const idx = deployed.findIndex(item => item.symbol === token.symbol);
    const result = idx >= 0 ? tokenData?.[idx] : undefined;
    if (result?.status === 'success' && result.result !== undefined) {
      acc[token.symbol] = Number(formatUnits(result.result as bigint, token.decimals));
    } else {
      acc[token.symbol] = 0;
    }
    return acc;
  }, {});

  const ethAmt = ethBalance ? Number(formatUnits(ethBalance.value, ethBalance.decimals)) : 0;

  useEffect(() => {
    if (ethBalance) setNativeBalance(ethAmt);
  }, [ethAmt, ethBalance, setNativeBalance]);

  useEffect(() => {
    if (!isConnected) return;
    setAllBalances({
      nvr: tokenBalances.NVR ?? 0,
      ybob: tokenBalances.yBOB ?? 0,
      ytoken: tokenBalances.YTOKEN ?? 0,
      ygold: tokenBalances.YGOLD ?? 0,
      gami: tokenBalances.GAMI ?? 0,
      cents: tokenBalances.CENTS ?? 0,
    });
  }, [isConnected, setAllBalances, tokenBalances.NVR, tokenBalances.yBOB, tokenBalances.YTOKEN, tokenBalances.YGOLD, tokenBalances.GAMI, tokenBalances.CENTS]);

  const holdings = [
    {
      symbol: 'ETH',
      name: 'Ethereum & Hedera',
      value: ethAmt,
      color: '#10b981',
      role: 'Native EVM gas',
      deployed: true,
      address: null as `0x${string}` | null,
    },
    ...ECOSYSTEM_TOKENS.map(token => ({
      symbol: token.symbol,
      name: token.name,
      value: tokenBalances[token.symbol] ?? 0,
      color: token.color,
      role: token.role,
      deployed: Boolean(token.address),
      address: token.address,
    })),
  ];

  const refresh = async () => {
    await Promise.allSettled([refetchNative(), refetchTokens()]);
  };

  return {
    address,
    isConnected,
    chainId,
    onSepolia: chainId === sepolia.id,
    holdings,
    ethAmt,
    tokenBalances,
    loading: ethLoading || tokensLoading,
    refresh,
    deployedCount: deployed.length,
  };
}
