/**
 * POST /api/hedera/securities/withdraw
 *
 * Executes a real Hedera HTS token withdrawal from the KAI treasury
 * back to the user's account.
 *
 * Security: Private key server-side only. Returns real Hedera TX ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { transferHts, getHederaClient } from '@/lib/hederaClient';
import { logHcsEvent } from '@/lib/hcsAudit';
import { executeContractProductWithdraw } from '@/lib/productVaultClient';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productId, tokenSymbol, amount, recipientAccount } = body;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!productId || !tokenSymbol || !amount || !recipientAccount) {
      return NextResponse.json(
        { error: 'Missing required fields: productId, tokenSymbol, amount, recipientAccount' },
        { status: 400 },
      );
    }

    const tokenId = HTS_TOKENS[tokenSymbol as keyof typeof HTS_TOKENS];
    if (!tokenId) {
      return NextResponse.json(
        { error: `Token ${tokenSymbol} not found in HTS registry` },
        { status: 400 },
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json({ error: 'Invalid withdrawal amount' }, { status: 400 });
    }

    if (!/^\d+\.\d+\.\d+$/.test(recipientAccount)) {
      return NextResponse.json(
        { error: 'recipientAccount must be a Hedera account ID (e.g. 0.0.12345)' },
        { status: 400 },
      );
    }

    // ── Operator check ────────────────────────────────────────────────────────
    const client = getHederaClient();
    if (!client) {
      return NextResponse.json(
        { error: 'Hedera operator not configured — check server environment variables' },
        { status: 503 },
      );
    }

    // ── Execute HTS transfer (treasury → recipient) ───────────────────────────
    const decimals = ['CENTS', 'YBOB', 'KBAR'].includes(tokenSymbol) ? 6 : 8;
    const rawAmount = Math.round(parsedAmount * Math.pow(10, decimals));

    const result = await transferHts(tokenId, recipientAccount, rawAmount);

    // ── Execute EVM smart contract withdraw on Hedera Testnet ─────────────────
    let evmTx: { txHash: string; explorerUrl: string; feePaid: string; contractAddress: string } | null = null;
    try {
      evmTx = await executeContractProductWithdraw({
        productId,
        tokenSymbol,
        amount: parsedAmount,
      });
    } catch (evmErr) {
      console.warn('[securities/withdraw] EVM contract withdraw call notice:', evmErr);
    }

    // ── Audit log ─────────────────────────────────────────────────────────────
    try {
      await logHcsEvent({
        event: 'AGENT_ACTION',
        metadata: {
          action: 'PRODUCT_WITHDRAW',
          productId,
          tokenSymbol,
          tokenId,
          amount: parsedAmount,
          evmTxHash: evmTx?.txHash ?? null,
        },
        recipient: recipientAccount,
        txId: result.transactionId,
      });
    } catch (auditErr) {
      console.warn('[securities/withdraw] HCS audit log failed:', auditErr);
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      transactionId: result.transactionId,
      explorerUrl: result.explorerUrl,
      evmTxHash: evmTx?.txHash ?? null,
      evmExplorerUrl: evmTx?.explorerUrl ?? null,
      contractAddress: evmTx?.contractAddress ?? null,
      contractFeePaid: evmTx?.feePaid ?? '0.001 HBAR',
      withdrawal: {
        productId,
        tokenSymbol,
        tokenId,
        amount: parsedAmount,
        recipientAccount,
        network: process.env.HEDERA_NETWORK ?? 'testnet',
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Withdrawal failed';
    console.error('[/api/hedera/securities/withdraw] Error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
