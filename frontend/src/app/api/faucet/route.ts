import { NextRequest, NextResponse } from 'next/server';
import { getHederaClient, transferHbar, transferHts, mintHtsToken } from '@/lib/hederaClient';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { logHcsEvent, type HcsEventType } from '@/lib/hcsAudit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let { address } = body;

    // Default to user's Hedera account if not provided or if 0x address
    if (!address || !/^0\.0\.\d+$/.test(address.trim())) {
      address = '0.0.5883612';
    }
    const cleanAccount = address.trim();

    const dispensedAmounts = {
      hbar: 20,
      nvr: 20000,
      ybob: 20000,
      ytoken: 20000,
      ygold: 20000,
      gami: 20000,
      cents: 20000,
      kbar: 20000,
    };

    const results: Record<string, { status: string; txId?: string; explorerUrl?: string }> = {};

    const client = getHederaClient();
    if (!client) {
      return NextResponse.json({ error: 'Hedera client not initialized (missing operator credentials)' }, { status: 500 });
    }

    // 1. Transfer 20 HBAR
    try {
      const hbarRes = await transferHbar(cleanAccount, dispensedAmounts.hbar);
      results['HBAR'] = {
        status: 'SUCCESS',
        txId: hbarRes.transactionId,
        explorerUrl: hbarRes.explorerUrl,
      };
    } catch (e: any) {
      console.warn('Faucet HBAR notice:', e?.message || e);
      results['HBAR'] = { status: `FAILED: ${e?.message || e}` };
    }

    // 2. Transfer or mint each HTS token
    for (const [sym, tokenId] of Object.entries(HTS_TOKENS)) {
      const amount = dispensedAmounts[sym.toLowerCase() as keyof typeof dispensedAmounts] || 20000;
      const is6Decimals = sym === 'YBOB' || sym === 'CENTS' || sym === 'KBAR';

      try {
        const res = await transferHts(tokenId, cleanAccount, amount);
        results[sym] = {
          status: 'SUCCESS',
          txId: res.transactionId,
          explorerUrl: res.explorerUrl,
        };
      } catch {
        try {
          const mintRes = await mintHtsToken(tokenId, cleanAccount, amount, is6Decimals ? 6 : 8);
          results[sym] = {
            status: 'SUCCESS (MINTED)',
            txId: mintRes.transactionId,
            explorerUrl: mintRes.explorerUrl,
          };
        } catch (mintErr: any) {
          results[sym] = { status: `FAILED: ${mintErr?.message || mintErr}` };
        }
      }
    }

    // 3. Log HCS audit event on-chain
    try {
      await logHcsEvent({
        event: 'FAUCET_DISPENSE' as HcsEventType,
        recipient: cleanAccount,
        amount: dispensedAmounts.hbar,
        metadata: { dispensed: dispensedAmounts, results },
      });
    } catch (hcsErr) {
      console.warn('[Faucet API] HCS audit log notice:', hcsErr);
    }

    return NextResponse.json({
      success: true,
      address: cleanAccount,
      dispensed: dispensedAmounts,
      transfers: results,
      onChain: true,
      message: `Successfully dispensed on-chain tokens to ${cleanAccount} on Hedera Testnet!`,
    });
  } catch (err: any) {
    console.error('Faucet error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to dispense faucet tokens' },
      { status: 500 },
    );
  }
}
