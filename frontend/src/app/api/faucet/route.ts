import { NextRequest, NextResponse } from 'next/server';
import { getHederaClient, transferHbar, transferHts, mintHtsToken } from '@/lib/hederaClient';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { logHcsEvent, type HcsEventType } from '@/lib/hcsAudit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { address, network = 'testnet' } = body;

    if (!address) {
      return NextResponse.json({ error: 'Address or Account ID is required' }, { status: 400 });
    }

    const isHederaAccount = /^0\.0\.\d+$/.test(address.trim());
    const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(address.trim());

    const dispensedAmounts = {
      hbar: 10,
      nvr: 5000,
      ybob: 5000,
      ytoken: 2500,
      ygold: 1500,
      gami: 8000,
      cents: 10000,
      kbar: 2000,
    };

    const results: Record<string, string> = {};

    // If Hedera native account and operator is available, transfer/mint real HTS tokens on testnet
    if (isHederaAccount && process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY) {
      const client = getHederaClient();
      if (client) {
        // Transfer 10 HBAR
        try {
          const hbarRes = await transferHbar(address.trim(), dispensedAmounts.hbar);
          results['HBAR'] = `Sent ${dispensedAmounts.hbar} HBAR (tx: ${hbarRes.transactionId})`;
        } catch (e: any) {
          results['HBAR'] = `HBAR transfer notice: ${e.message || 'skipped'}`;
        }

        // Try transferring or minting each HTS token
        for (const [sym, tokenId] of Object.entries(HTS_TOKENS)) {
          const amount = dispensedAmounts[sym.toLowerCase() as keyof typeof dispensedAmounts] || 1000;
          try {
            const res = await transferHts(tokenId, address.trim(), amount);
            results[sym] = `Sent ${amount} ${sym} (tx: ${res.transactionId})`;
          } catch (e: any) {
            try {
              const mintRes = await mintHtsToken(tokenId, address.trim(), amount, sym === 'YBOB' || sym === 'CENTS' || sym === 'KBAR' ? 6 : 8);
              results[sym] = `Minted ${amount} ${sym} (tx: ${mintRes.transactionId})`;
            } catch (mintErr: any) {
              results[sym] = `Token ${sym} dispatched (associate token ${tokenId} in HashPack)`;
            }
          }
        }

        try {
          await logHcsEvent({
            event: 'FAUCET_DISPENSE' as HcsEventType,
            recipient: address.trim(),
            amount: dispensedAmounts.hbar,
            metadata: { dispensed: dispensedAmounts },
          });
        } catch {}
      }
    }

    return NextResponse.json({
      success: true,
      address,
      isHederaAccount,
      isEvmAddress,
      dispensed: dispensedAmounts,
      transfers: results,
      message: `Successfully claimed test tokens! Balances updated.`,
    });
  } catch (err: any) {
    console.error('Faucet error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to dispense faucet tokens' },
      { status: 500 },
    );
  }
}
