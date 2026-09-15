/**
 * swapRates.ts
 * Configurable HBAR → KAI ecosystem token exchange rates.
 *
 * PRD requirement:
 *   1 HBAR = 10 Y (NVR/YTOKEN)
 *   1 HBAR = 1,000 KAI Cents (CENTS)
 *
 * All rates expressed as "how many output tokens per 1 HBAR".
 * To change rates: update this file — the swap engine reads from here.
 */

export interface SwapRate {
  /** How many output tokens you receive per 1 HBAR input */
  ratePerHbar: number;
  /** Human label shown in swap UI */
  label: string;
  /** Fee deducted from output (0.003 = 0.3%) */
  feePercent: number;
  /** Max allowed slippage before TX is rejected */
  maxSlippage: number;
  /** Hedera HTS token ID (from hederaTokens.ts HTS_TOKENS) */
  htsTokenId?: string;
}

/**
 * Primary configurable rate table.
 * Key = output token symbol (as used in ECOSYSTEM_TOKENS / HTS_TOKENS).
 */
export const HBAR_RATES: Record<string, SwapRate> = {
  // PRD mandated rates
  NVR: {
    ratePerHbar: 10,
    label: '1 HBAR = 10 NVR',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  YTOKEN: {
    ratePerHbar: 10,
    label: '1 HBAR = 10 Y Token',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  CENTS: {
    ratePerHbar: 1000,
    label: '1 HBAR = 1,000 KAI Cents',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  // Configurable — add/adjust as needed
  YGOLD: {
    ratePerHbar: 0.05,
    label: '1 HBAR = 0.05 Y Gold',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  GAMI: {
    ratePerHbar: 25,
    label: '1 HBAR = 25 GAMI',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  YBOB: {
    ratePerHbar: 0.12,
    label: '1 HBAR = 0.12 yBOB',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
  KBAR: {
    ratePerHbar: 2.4,
    label: '1 HBAR = 2.4 KBAR',
    feePercent: 0.003,
    maxSlippage: 0.01,
  },
};

/**
 * Compute expected output for a swap.
 * @param fromSymbol  Input token symbol (currently only HBAR supported as input)
 * @param toSymbol    Output token symbol
 * @param inputAmount Amount of input token (in whole units)
 * @returns           Breakdown of the swap calculation
 */
export function computeSwapOutput(
  fromSymbol: string,
  toSymbol: string,
  inputAmount: number,
): {
  inputAmount: number;
  outputAmount: number;
  outputAfterFee: number;
  feeAmount: number;
  rate: SwapRate | null;
  rateLabel: string;
  minReceived: (slippagePct: number) => number;
} {
  // HBAR → Token
  if (fromSymbol === 'HBAR') {
    const rate = HBAR_RATES[toSymbol] ?? null;
    if (!rate) {
      return {
        inputAmount,
        outputAmount: 0,
        outputAfterFee: 0,
        feeAmount: 0,
        rate: null,
        rateLabel: 'Rate not available',
        minReceived: () => 0,
      };
    }
    const rawOutput  = inputAmount * rate.ratePerHbar;
    const feeAmount  = rawOutput * rate.feePercent;
    const afterFee   = rawOutput - feeAmount;
    return {
      inputAmount,
      outputAmount: rawOutput,
      outputAfterFee: afterFee,
      feeAmount,
      rate,
      rateLabel: rate.label,
      minReceived: (slippage) => afterFee * (1 - slippage / 100),
    };
  }

  // Token → HBAR (inverse)
  if (toSymbol === 'HBAR') {
    const rate = HBAR_RATES[fromSymbol] ?? null;
    if (!rate) {
      return {
        inputAmount,
        outputAmount: 0,
        outputAfterFee: 0,
        feeAmount: 0,
        rate: null,
        rateLabel: 'Rate not available',
        minReceived: () => 0,
      };
    }
    const rawOutput = inputAmount / rate.ratePerHbar;
    const feeAmount = rawOutput * rate.feePercent;
    const afterFee  = rawOutput - feeAmount;
    return {
      inputAmount,
      outputAmount: rawOutput,
      outputAfterFee: afterFee,
      feeAmount,
      rate: { ...rate, ratePerHbar: 1 / rate.ratePerHbar },
      rateLabel: `1 ${fromSymbol} = ${(1 / rate.ratePerHbar).toFixed(6)} HBAR`,
      minReceived: (slippage) => afterFee * (1 - slippage / 100),
    };
  }

  // Token → Token (route through HBAR)
  const rateFrom = HBAR_RATES[fromSymbol] ?? null;
  const rateTo   = HBAR_RATES[toSymbol]   ?? null;
  if (!rateFrom || !rateTo) {
    return {
      inputAmount, outputAmount: 0, outputAfterFee: 0, feeAmount: 0,
      rate: null, rateLabel: 'Rate not available', minReceived: () => 0,
    };
  }
  const hbarMid    = inputAmount / rateFrom.ratePerHbar;
  const rawOutput  = hbarMid * rateTo.ratePerHbar;
  const feeAmount  = rawOutput * Math.max(rateFrom.feePercent, rateTo.feePercent);
  const afterFee   = rawOutput - feeAmount;
  return {
    inputAmount,
    outputAmount: rawOutput,
    outputAfterFee: afterFee,
    feeAmount,
    rate: null,
    rateLabel: `1 ${fromSymbol} ≈ ${(rateTo.ratePerHbar / rateFrom.ratePerHbar).toFixed(6)} ${toSymbol}`,
    minReceived: (slippage) => afterFee * (1 - slippage / 100),
  };
}

/** Formatted exchange rate string shown in swap UI */
export function getDisplayRate(fromSymbol: string, toSymbol: string): string {
  if (fromSymbol === 'HBAR' && HBAR_RATES[toSymbol]) {
    return HBAR_RATES[toSymbol].label;
  }
  if (toSymbol === 'HBAR' && HBAR_RATES[fromSymbol]) {
    const r = HBAR_RATES[fromSymbol].ratePerHbar;
    return `1 ${fromSymbol} = ${(1 / r).toFixed(6)} HBAR`;
  }
  return 'Configurable rate';
}
