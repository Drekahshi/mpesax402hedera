/**
 * POST /api/hedera/swap
 *
 * Server-side Hedera HTS swap execution.
 * Reads configurable rates from swapRates.ts.
 * Uses hederaClient.ts operator to transfer HTS tokens to the user.
 *
 * Security: Private key is server-side only. Never exposed to client.
 * All execution happens here — client only receives a TX ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeSwapOutput } from '@/lib/swapRates';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { transferHts, transferHbar, getHederaClient } from '@/lib/hederaClient';

// Minimum amounts to prevent dust attacks
const MIN_HBAR_SWAP = 0.01;
const MAX_HBAR_SWAP = 10_000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fromSymbol, toSymbol, inputAmount, recipientAccount } = body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!fromSymbol || !toSymbol || !inputAmount || !recipientAccount) {
      return NextResponse.json(
        { error: 'Missing required fields: fromSymbol, toSymbol, inputAmount, recipientAccount' },
        { status: 400 },
      );
    }

    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid inputAmount' }, { status: 400 });
    }

    // Validate recipient looks like a Hedera account ID
    if (!/^\d+\.\d+\.\d+$/.test(recipientAccount)) {
      return NextResponse.json(
        { error: 'recipientAccount must be a Hedera account ID (e.g. 0.0.12345)' },
        { status: 400 },
      );
    }

    // ── Rate calculation ──────────────────────────────────────────────────────
    const quote = computeSwapOutput(fromSymbol, toSymbol, amount);
    if (!quote.rate && fromSymbol !== 'HBAR' && toSymbol !== 'HBAR') {
      // Token→Token needs both rates
    }
    if (quote.outputAfterFee <= 0) {
      return NextResponse.json(
        { error: `No exchange rate available for ${fromSymbol} → ${toSymbol}` },
        { status: 400 },
      );
    }

    // ── Operator client check ─────────────────────────────────────────────────
    const client = getHederaClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Hedera operator not configured — check HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY' },
        { status: 503 },
      );
    }

    // ── Execute swap ──────────────────────────────────────────────────────────
    let result;

    if (fromSymbol === 'HBAR' && toSymbol !== 'HBAR') {
      // HBAR → HTS Token: operator sends HTS tokens to recipient
      if (amount < MIN_HBAR_SWAP || amount > MAX_HBAR_SWAP) {
        return NextResponse.json(
          { error: `HBAR amount must be between ${MIN_HBAR_SWAP} and ${MAX_HBAR_SWAP}` },
          { status: 400 },
        );
      }

      const tokenId = HTS_TOKENS[toSymbol as keyof typeof HTS_TOKENS];
      if (!tokenId) {
        return NextResponse.json(
          { error: `Token ${toSymbol} not found in HTS registry` },
          { status: 400 },
        );
      }

      // Determine decimals (CENTS and YBOB use 6, others use 8)
      const decimals = ['CENTS', 'YBOB', 'KBAR'].includes(toSymbol) ? 6 : 8;
      const rawAmount = Math.round(quote.outputAfterFee * Math.pow(10, decimals));

      result = await transferHts(tokenId, recipientAccount, rawAmount);

    } else if (toSymbol === 'HBAR' && fromSymbol !== 'HBAR') {
      // HTS Token → HBAR: operator sends HBAR to recipient
      result = await transferHbar(recipientAccount, quote.outputAfterFee);

    } else {
      // HBAR → HBAR or unsupported pair
      return NextResponse.json(
        { error: 'Cannot swap HBAR to HBAR. Please select a different output token.' },
        { status: 400 },
      );
    }

    // ── Return confirmation ───────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      status: result.status,
      transactionId: result.transactionId,
      explorerUrl: result.explorerUrl,
      swap: {
        fromSymbol,
        toSymbol,
        inputAmount: amount,
        outputAmount: parseFloat(quote.outputAfterFee.toFixed(8)),
        feeAmount: parseFloat(quote.feeAmount.toFixed(8)),
        rateLabel: quote.rateLabel,
        network: process.env.HEDERA_NETWORK ?? 'testnet',
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Swap execution failed';
    console.error('[/api/hedera/swap] Error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

/** GET — return available swap rates (no auth needed) */
export async function GET() {
  const { HBAR_RATES } = await import('@/lib/swapRates');
  const rates = Object.entries(HBAR_RATES).map(([symbol, rate]) => ({
    fromSymbol: 'HBAR',
    toSymbol: symbol,
    ratePerHbar: rate.ratePerHbar,
    label: rate.label,
    feePercent: rate.feePercent,
  }));
  return NextResponse.json({ rates });
}
