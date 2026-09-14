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
    const {
      fromToken,
      toToken,
      fromAmount,
      recipient,
      slippageTolerance = 0.5,
    } = body;

    if (!fromToken || !toToken || !fromAmount || !recipient) {
      return NextResponse.json(
        { error: 'Missing required parameters: fromToken, toToken, fromAmount, recipient' },
        { status: 400 },
      );
    }

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

    let txId = `swap-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    let explorerUrl = `https://hashscan.io/testnet/transaction/${txId}`;
    let onChain = false;

    // On-chain execution for Hedera accounts when operator credentials exist
    const isHederaAccount = /^0\.0\.\d+$/.test(recipient.trim());
    if (isHederaAccount && process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY) {
      const client = getHederaClient();
      if (client) {
        try {
          if (toSym === 'HBAR') {
            // User receives HBAR
            const hbarRes = await transferHbar(recipient.trim(), toAmount);
            txId = hbarRes.transactionId;
            explorerUrl = hbarRes.explorerUrl;
            onChain = true;
          } else {
            // User receives HTS token
            const tokenId = HTS_TOKENS[toSym as keyof typeof HTS_TOKENS];
            if (tokenId) {
              try {
                const htsRes = await transferHts(tokenId, recipient.trim(), toAmount);
                txId = htsRes.transactionId;
                explorerUrl = htsRes.explorerUrl;
                onChain = true;
              } catch (e: any) {
                // If transfer from treasury fails (e.g. low treasury balance), try minting to user
                const mintRes = await mintHtsToken(tokenId, recipient.trim(), toAmount, toSym === 'YBOB' || toSym === 'CENTS' || toSym === 'KBAR' ? 6 : 8);
                txId = mintRes.transactionId;
                explorerUrl = mintRes.explorerUrl;
                onChain = true;
              }
            }
          }

          // Log swap on HCS audit topic
          await logHcsEvent({
            event: 'SWAP_EXECUTE' as HcsEventType,
            recipient: recipient.trim(),
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
        } catch (e: any) {
          console.warn('[Swap API] On-chain Hedera dispatch notice:', e.message);
        }
      }
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
      recipient,
      txId,
      explorerUrl,
      onChain,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Swap API error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process swap' },
      { status: 500 },
    );
  }
}

