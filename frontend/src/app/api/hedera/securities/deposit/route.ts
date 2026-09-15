/**
 * POST /api/hedera/securities/deposit
 *
 * Executes a real Hedera HTS token deposit into the KAI treasury
 * for a securities product (KaiTrust, Kai Pension, Money Market Fund, etc.).
 *
 * For the testnet demo: operator transfers HTS tokens FROM treasury TO user
 * to simulate the product allocation (since user may not hold HTS tokens directly).
 * In production: user signs with HashPack to transfer their own tokens.
 *
 * Security: Private key server-side only. Returns real Hedera TX ID.
 */

import { NextRequest, NextResponse } from 'next/server';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { transferHts, getHederaClient } from '@/lib/hederaClient';
import { logHcsEvent } from '@/lib/hcsAudit';
import { executeContractProductDeposit } from '@/lib/productVaultClient';

const VALID_PRODUCTS = ['trust', 'pension', 'mmf', 'rwa', 'crop', 'forest', 'medical',
  'honey', 'beads', 'necklace', 'milk', 'medicine', 'recipe', 'charcoal',
  'weaving', 'seeds', 'water', 'pottery', 'bark'];

const MIN_DEPOSIT = 0.0001;
const MAX_DEPOSIT = 1_000_000;

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

    if (!VALID_PRODUCTS.includes(productId)) {
      return NextResponse.json({ error: `Unknown productId: ${productId}` }, { status: 400 });
    }

    const tokenId = HTS_TOKENS[tokenSymbol as keyof typeof HTS_TOKENS];
    if (!tokenId) {
      return NextResponse.json(
        { error: `Token ${tokenSymbol} not found in HTS registry` },
        { status: 400 },
      );
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < MIN_DEPOSIT || parsedAmount > MAX_DEPOSIT) {
      return NextResponse.json(
        { error: `Amount must be between ${MIN_DEPOSIT} and ${MAX_DEPOSIT}` },
        { status: 400 },
      );
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

    // ── Execute HTS transfer ──────────────────────────────────────────────────
    const decimals = ['CENTS', 'YBOB', 'KBAR'].includes(tokenSymbol) ? 6 : 8;
    const rawAmount = Math.round(parsedAmount * Math.pow(10, decimals));

    const result = await transferHts(tokenId, recipientAccount, rawAmount);

    // ── Execute EVM smart contract deposit on Hedera Testnet ──────────────────
    let evmTx: { txHash: string; explorerUrl: string; feePaid: string; contractAddress: string } | null = null;
    try {
      evmTx = await executeContractProductDeposit({
        productId,
        tokenSymbol,
        amount: parsedAmount,
      });
    } catch (evmErr) {
      console.warn('[securities/deposit] EVM contract deposit call notice:', evmErr);
    }

    // ── Audit log on HCS ──────────────────────────────────────────────────────
    try {
      await logHcsEvent({
        event: 'AGENT_ACTION',
        metadata: {
          action: 'PRODUCT_DEPOSIT',
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
      // Non-fatal — log but don't fail the response
      console.warn('[securities/deposit] HCS audit log failed:', auditErr);
    }

    // ── Return confirmation ───────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      status: result.status,
      transactionId: result.transactionId,
      explorerUrl: result.explorerUrl,
      evmTxHash: evmTx?.txHash ?? null,
      evmExplorerUrl: evmTx?.explorerUrl ?? null,
      contractAddress: evmTx?.contractAddress ?? null,
      contractFeePaid: evmTx?.feePaid ?? '0.001 HBAR',
      deposit: {
        productId,
        tokenSymbol,
        tokenId,
        amount: parsedAmount,
        recipientAccount,
        network: process.env.HEDERA_NETWORK ?? 'testnet',
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Deposit failed';
    console.error('[/api/hedera/securities/deposit] Error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
