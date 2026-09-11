'use client';

import { useEcosystemBalances } from '@/hooks/useEcosystemBalances';

/** Compatibility hook used by securities and other pages. */
export function useBalances() {
  const { refresh } = useEcosystemBalances();
  return { refreshBalances: refresh };
}
