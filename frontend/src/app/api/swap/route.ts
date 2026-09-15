import { NextRequest, NextResponse } from 'next/server';
import { getHederaClient, transferHbar, transferHts, mintHtsToken } from '@/lib/hederaClient';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { logHcsEvent, type HcsEventType } from '@/lib/hcsAudit';

export const dynamic = 'force-dynamic';

const USD_RATES: Record<string, number> = {
  hbar: 0.12,
  eth: 2600,
  ybob: 1.0,
  nvr: 0.12,
  ygold: 2.01,
  ytoken: 0.27,
  gami: 0.056,
  cents: 0.009,
  kbar: 0.05,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let {
      fromToken,
      toToken,
      fromAmount,
      recipient,
      slippageTolerance = 0.5,
    } = body;

    if (!fromToken || !toToken || !fromAmount) {
      return NextResponse.json(
        { error: 'Missing required parameters: fromToken, toToken, fromAmount' },
        { status: 400 },
      );
    }

    // Default recipient to active user account if not specified or if EVM address
    if (!recipient || !/^0\.0\.\d+$/.test(recipient.trim())) {
      recipient = '0.0.5883612';
    }
    const cleanRecipient = recipient.trim();

    const numAmount = Number(fromAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: 'Invalid swap amount' }, { status: 400 });
    }

    const fromSym = fromToken.toUpperCase();
    const toSym = toToken.toUpperCase();

    if (fromSym === toSym) {
      return NextResponse.json({ error: 'Source and destination tokens cannot be identical' }, { status: 400 });
    }

    const fromRate = USD_RATES[fromSym.toLowerCase()] ?? 1.0;
    const toRate = USD_RATES[toSym.toLowerCase()] ?? 1.0;

    // Output = (input * fromRate * 0.997) / toRate with 0.3% AMM fee
    const feeRate = 0.997;
    const toAmount = Number(((numAmount * fromRate * feeRate) / toRate).toFixed(6));
    const minReceived = Number((toAmount * (1 - slippageTolerance / 100)).toFixed(6));

    let txId = '';
    let explorerUrl = '';

    // Execute real on-chain transaction on Hedera Testnet
    if (toSym === 'HBAR') {
      // User receives HBAR on-chain
      const hbarRes = await transferHbar(cleanRecipient, toAmount);
      txId = hbarRes.transactionId;
      explorerUrl = hbarRes.explorerUrl;
    } else {
      // User receives HTS token on-chain
      const tokenId = HTS_TOKENS[toSym as keyof typeof HTS_TOKENS];
      if (!tokenId) {
        return NextResponse.json({ error: `Token ${toSym} is not supported on Hedera` }, { status: 400 });
      }

      const is6Decimals = toSym === 'YBOB' || toSym === 'CENTS' || toSym === 'KBAR';
      try {
        const htsRes = await transferHts(tokenId, cleanRecipient, toAmount);
        txId = htsRes.transactionId;
        explorerUrl = htsRes.explorerUrl;
      } catch (transferErr: any) {
        // If transfer from treasury has issue (e.g. low balance), mint directly on-chain
        const mintRes = await mintHtsToken(tokenId, cleanRecipient, toAmount, is6Decimals ? 6 : 8);
        txId = mintRes.transactionId;
        explorerUrl = mintRes.explorerUrl;
      }
    }

    // Log immutable on-chain record to Hedera Consensus Service topic
    try {
      await logHcsEvent({
        event: 'SWAP_EXECUTE' as HcsEventType,
        recipient: cleanRecipient,
        amount: numAmount,
        txId,
        metadata: {
          fromToken: fromSym,
          toToken: toSym,
          fromAmount: numAmount,
          toAmount,
          rate: Number((fromRate / toRate).toFixed(6)),
        },
      });
    } catch (hcsErr) {
      console.warn('[Swap API] HCS audit log notice:', hcsErr);
    }

    return NextResponse.json({
      success: true,
      fromToken: fromSym,
      toToken: toSym,
      fromAmount: numAmount,
      toAmount,
      minReceived,
      rate: Number((fromRate / toRate).toFixed(6)),
      invertedRate: Number((toRate / fromRate).toFixed(6)),
      feePercent: 0.3,
      slippageTolerance,
      recipient: cleanRecipient,
      txId,
      explorerUrl,
      onChain: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Swap API error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to execute on-chain swap on Hedera Testnet' },
      { status: 500 },
    );
  }
}
