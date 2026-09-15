/**
 * /api/hedera — Hedera operator REST proxy.
 *
 * All sub-routes live here under a single dynamic dispatch so the operator
 * key stays in one server-side file. Each action is dispatched by the
 * `action` field in the JSON body.
 *
 * Actions:
 *   balance          — get HBAR + HTS token balances via SDK
 *   transfer-hbar    — transfer HBAR from operator to recipient
 *   transfer-hts     — transfer HTS fungible token
 *   transfer-nft     — transfer HTS NFT serial
 *   associate-token  — associate HTS token(s) with an account
 *   mint-kaibar      — mint KAIBAR HTS tokens + transfer to recipient
 *   mint-connft      — mint Conservation NFT + transfer to recipient
 *   hcs-log          — write an HCS audit message
 *   receipt          — fetch transaction receipt by ID
 *
 * Security: this route holds the real Hedera operator private key and can
 * move real funds (HBAR, HTS tokens, NFTs) — it is gated by a shared
 * INTERNAL_SERVICE_KEY (see .env.example), checked below, and every HBAR
 * transfer is capped per-tx. Never remove the guard or the cap.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getHederaClient,
  getHederaAccountBalance,
  transferHbar,
  transferHts,
  transferNft,
  associateToken,
  getTransactionReceipt,
  mintHtsToken,
} from '@/lib/hederaClient';
import { HTS_TOKENS } from '@/lib/hederaTokens';
import { logHcsEvent, type HcsEventType } from '@/lib/hcsAudit';

// ── Shared response helpers ───────────────────────────────────────────────────

function ok(data: unknown) {
  return NextResponse.json(data);
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ── Route handler ─────────────────────────────────────────────────────────────

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';
const HBAR_TRANSFER_PER_TX_CAP = 100; // hard ceiling — raise deliberately, never remove

export async function POST(req: NextRequest) {
  // Fail closed: if the secret isn't configured, no request is trusted —
  // this endpoint holds the real operator key and must never be open by
  // default just because setup is incomplete.
  if (!INTERNAL_KEY) {
    return err('INTERNAL_SERVICE_KEY is not configured on the server', 503);
  }
  if (req.headers.get('x-internal-key') !== INTERNAL_KEY) {
    return err('Unauthorized', 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body');
  }

  const action = body.action as string;
  if (!action) return err('Missing action field');

  try {
    switch (action) {

      // ── Balance ────────────────────────────────────────────────────────────
      case 'balance': {
        const accountId = body.accountId as string;
        if (!accountId) return err('accountId required');
        const balance = await getHederaAccountBalance(accountId);
        return ok(balance);
      }

      // ── HBAR transfer ──────────────────────────────────────────────────────
      case 'transfer-hbar': {
        const to     = body.to as string;
        const amount = body.amount as number;
        if (!to || !amount) return err('to and amount required');
        if (amount <= 0) return err('amount must be positive');
        if (amount > HBAR_TRANSFER_PER_TX_CAP) {
          return err(`Per-tx cap: max ${HBAR_TRANSFER_PER_TX_CAP} HBAR`);
        }
        const result = await transferHbar(to, amount);
        await logHcsEvent({
          event: 'HBAR_TRANSFER',
          sender: process.env.HEDERA_OPERATOR_ID, recipient: to, amount: amount as number,
          txId: result.transactionId,
        });
        return ok(result);
      }

      // ── HTS fungible transfer ──────────────────────────────────────────────
      case 'transfer-hts': {
        const { tokenId, to, amount } = body as { tokenId: string; to: string; amount: number };
        if (!tokenId || !to || !amount) return err('tokenId, to, and amount required');
        const result = await transferHts(tokenId, to, amount);
        await logHcsEvent({
          event: 'KAIBAR_TRANSFER',
          tokenId, recipient: to, txId: result.transactionId,
        });
        return ok(result);
      }

      // ── NFT transfer ───────────────────────────────────────────────────────
      case 'transfer-nft': {
        const { tokenId, serialNumber, to } = body as {
          tokenId: string; serialNumber: number; to: string;
        };
        if (!tokenId || !serialNumber || !to) return err('tokenId, serialNumber, and to required');
        const result = await transferNft(tokenId, serialNumber, to);
        await logHcsEvent({
          event: 'CONSERVATION_NFT_TRANSFER',
          tokenId, serials: [serialNumber], recipient: to, txId: result.transactionId,
        });
        return ok(result);
      }

      // ── Token association ──────────────────────────────────────────────────
      case 'associate-token': {
        const { accountId, tokenIds } = body as { accountId: string; tokenIds: string[] };
        if (!accountId || !tokenIds?.length) return err('accountId and tokenIds required');
        const result = await associateToken(accountId, tokenIds);
        await logHcsEvent({
          event: 'HTS_TOKEN_ASSOCIATE',
          metadata: { accountId, tokenIds }, txId: result.transactionId,
        });
        return ok(result);
      }

      // ── KAIBAR mint + transfer ─────────────────────────────────────────────
      case 'mint-kaibar': {
        const { recipient, amount, reason } = body as {
          recipient: string; amount: number; reason: string;
        };
        if (!recipient || !amount) return err('recipient and amount required');

        const tokenIdStr = process.env.HEDERA_KAIBAR_TOKEN_ID;
        if (!tokenIdStr) return err('HEDERA_KAIBAR_TOKEN_ID not configured', 503);

        const DECIMALS   = 6;
        const PER_TX_CAP = 10_000;
        if (amount > PER_TX_CAP) return err(`Per-tx cap: max ${PER_TX_CAP} KBAR`);

        const client = getHederaClient();
        if (!client) return err('Hedera client not initialised', 503);

        // Dynamic import to keep SDK types self-contained in this function scope
        const { TokenMintTransaction, TransferTransaction, TokenId, AccountId, Hbar } =
          await import('@hashgraph/sdk');

        const tokenId     = TokenId.fromString(tokenIdStr);
        const operatorId  = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
        const recipientId = AccountId.fromString(recipient);
        const rawAmount   = Math.round(amount * Math.pow(10, DECIMALS));

        // Mint to treasury
        const mintTx = await new TokenMintTransaction()
          .setTokenId(tokenId)
          .setAmount(rawAmount)
          .setMaxTransactionFee(new Hbar(5))
          .execute(client);
        const mintReceipt = await mintTx.getReceipt(client);
        const mintTxId    = mintTx.transactionId.toString();

        // Transfer treasury → recipient
        const xferTx = await new TransferTransaction()
          .addTokenTransfer(tokenId, operatorId,  -rawAmount)
          .addTokenTransfer(tokenId, recipientId,  rawAmount)
          .setMaxTransactionFee(new Hbar(5))
          .execute(client);
        const xferReceipt = await xferTx.getReceipt(client);
        const xferTxId    = xferTx.transactionId.toString();

        await logHcsEvent({
          event: 'KAIBAR_MINT',
          tokenId: tokenIdStr, recipient, amount,
          reason: reason ?? 'api_mint', txId: mintTxId, transferTxId: xferTxId,
          metadata: { rawAmount },
        });

        return ok({
          status:      xferReceipt.status.toString(),
          mintTxId,
          transferTxId: xferTxId,
          recipient,
          amount,
          totalSupply: mintReceipt.totalSupply?.toString(),
          explorerUrl: `https://hashscan.io/${process.env.HEDERA_NETWORK ?? 'testnet'}/transaction/${xferTxId}`,
        });
      }

      // ── Generic HTS Token mint + transfer (NVR, yBOB, YTOKEN, YGOLD, GAMI, CENTS, KBAR) ───
      case 'mint-token': {
        const { recipient, symbol, tokenId: passedTokenId, amount, decimals = 6, reason } = body as {
          recipient: string; symbol?: string; tokenId?: string; amount: number; decimals?: number; reason?: string;
        };
        if (!recipient || !amount || amount <= 0) return err('recipient and positive amount required');

        let targetTokenId = passedTokenId;
        if (!targetTokenId && symbol) {
          const symKey = symbol.toUpperCase() as keyof typeof HTS_TOKENS;
          targetTokenId = HTS_TOKENS[symKey];
        }

        if (!targetTokenId) {
          return err(`Token ID for symbol '${symbol}' not found`);
        }

        const PER_TX_CAP = 50_000;
        if (amount > PER_TX_CAP) return err(`Per-tx cap exceeded: max ${PER_TX_CAP} tokens`);

        const result = await mintHtsToken(targetTokenId, recipient, amount, decimals);

        await logHcsEvent({
          event: 'HTS_TOKEN_MINT' as HcsEventType,
          tokenId: targetTokenId,
          recipient,
          amount,
          reason: reason ?? `mint_${symbol || 'hts'}`,
          txId: result.transactionId,
          metadata: { symbol, decimals },
        });

        return ok(result);
      }

      // ── Conservation NFT mint + transfer ──────────────────────────────────
      case 'mint-connft': {
        const { recipient, conservation_id, event_type, metadata_pointer, count = 1 } = body as {
          recipient: string; conservation_id: string; event_type: string;
          metadata_pointer: string; count?: number;
        };
        if (!recipient || !conservation_id || !metadata_pointer) {
          return err('recipient, conservation_id, and metadata_pointer required');
        }

        const tokenIdStr = process.env.HEDERA_CONNFT_TOKEN_ID;
        if (!tokenIdStr) return err('HEDERA_CONNFT_TOKEN_ID not configured', 503);
        if (count < 1 || count > 10) return err('count must be 1–10');

        const client = getHederaClient();
        if (!client) return err('Hedera client not initialised', 503);

        const { TokenMintTransaction, TransferTransaction, TokenId, AccountId, NftId, Hbar } =
          await import('@hashgraph/sdk');

        const tokenId     = TokenId.fromString(tokenIdStr);
        const operatorId  = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
        const recipientId = AccountId.fromString(recipient);
        const metaBytes   = Buffer.from(metadata_pointer, 'utf-8');
        const metaList    = Array.from({ length: count }, () => metaBytes);

        const mintTx = await new TokenMintTransaction()
          .setTokenId(tokenId)
          .setMetadata(metaList)
          .setMaxTransactionFee(new Hbar(10))
          .execute(client);
        const mintReceipt = await mintTx.getReceipt(client);
        const serials     = mintReceipt.serials.map((s: { toNumber(): number }) => s.toNumber());
        const mintTxId    = mintTx.transactionId.toString();

        let xferBuilder = new TransferTransaction().setMaxTransactionFee(new Hbar(10));
        for (const serial of serials) {
          xferBuilder = xferBuilder.addNftTransfer(
            new NftId(tokenId, serial), operatorId, recipientId,
          );
        }
        const xferResp    = await xferBuilder.execute(client);
        const xferReceipt = await xferResp.getReceipt(client);
        const xferTxId    = xferResp.transactionId.toString();

        await logHcsEvent({
          event: 'CONSERVATION_NFT_MINT',
          tokenId: tokenIdStr, serials, recipient,
          txId: mintTxId, transferTxId: xferTxId,
          metadata: { conservation_id, event_type, metadataPointer: metadata_pointer },
        });

        return ok({
          status:       xferReceipt.status.toString(),
          mintTxId,
          transferTxId: xferTxId,
          serials,
          recipient,
          conservation_id,
          explorerUrl:  `https://hashscan.io/${process.env.HEDERA_NETWORK ?? 'testnet'}/transaction/${xferTxId}`,
        });
      }

      // ── HCS audit log ──────────────────────────────────────────────────────
      case 'hcs-log': {
        const { event, payload } = body as { event: string; payload: Record<string, unknown> };
        if (!event) return err('event required');
        const txId = await logHcsEvent({ event: event as HcsEventType, metadata: payload ?? {} });
        return ok({ logged: !!txId, txId });
      }

      // ── Transaction receipt ────────────────────────────────────────────────
      case 'receipt': {
        const txId = body.txId as string;
        if (!txId) return err('txId required');
        const receipt = await getTransactionReceipt(txId);
        return ok(receipt);
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    console.error('[/api/hedera]', action, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — health check
export async function GET() {
  return NextResponse.json({
    service:    'Hedera Rails API',
    network:    process.env.HEDERA_NETWORK ?? 'testnet',
    operator:   process.env.HEDERA_OPERATOR_ID ?? 'not set',
    kaibar:     process.env.HEDERA_KAIBAR_TOKEN_ID ?? 'not set',
    connft:     process.env.HEDERA_CONNFT_TOKEN_ID ?? 'not set',
    hcsTopic:   process.env.HEDERA_AUDIT_TOPIC_ID ?? 'not set',
    configured: !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY),
  });
}
