/**
 * hcsAudit.ts
 * HCS audit rail — server-side module for writing consensus-timestamped
 * audit log entries to the KAI Nuvari HCS topic.
 *
 * PRD Section 3.4: every mint, transfer, and x402 payment gets a
 * consensus-timestamped record. HCS entries are the source of truth for
 * "did this action actually happen", independent of Postgres.
 *
 * Usage (server-side API routes only):
 *   import { logHcsEvent } from '@/lib/hcsAudit';
 *   await logHcsEvent({ event: 'KAIBAR_MINT', ... });
 *
 * All public exports are async and fail-safe — a failed HCS write logs
 * a warning but never throws to the caller (prevents HCS outage from
 * blocking mint/transfer operations).
 */

import {
  TopicMessageSubmitTransaction,
  TopicId,
  Hbar,
} from '@hashgraph/sdk';
import { getHederaClient } from './hederaClient';

// ── Event type catalogue ──────────────────────────────────────────────────────

export type HcsEventType =
  | 'KAIBAR_MINT'
  | 'KAIBAR_TRANSFER'
  | 'CONSERVATION_NFT_MINT'
  | 'CONSERVATION_NFT_TRANSFER'
  | 'HTS_TOKEN_ASSOCIATE'
  | 'X402_PAYMENT'
  | 'X402_SETTLEMENT'
  | 'HBAR_TRANSFER'
  | 'AGENT_ACTION'
  | 'TOPIC_GENESIS';

export interface HcsAuditEntry {
  event: HcsEventType;
  /** Links to off-chain DB record (conservation event, order, payment ref) */
  recordId?: string;
  tokenId?: string;
  serials?: number[];
  sender?: string;
  recipient?: string;
  amount?: number | string;
  txId?: string;
  transferTxId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  network?: string;
}

// ── Core log function ─────────────────────────────────────────────────────────

/**
 * Write a structured JSON entry to the KAI HCS audit topic.
 * Returns the HCS transaction ID on success, or null if the write fails.
 * Never throws — audit failures are non-blocking.
 */
export async function logHcsEvent(entry: HcsAuditEntry): Promise<string | null> {
  const topicIdStr = process.env.HEDERA_AUDIT_TOPIC_ID;
  if (!topicIdStr) {
    console.warn('[HCS] HEDERA_AUDIT_TOPIC_ID not set — audit log skipped');
    return null;
  }

  const client = getHederaClient();
  if (!client) {
    console.warn('[HCS] Hedera client not available — audit log skipped');
    return null;
  }

  const payload: HcsAuditEntry = {
    ...entry,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    network:   entry.network ?? (process.env.HEDERA_NETWORK ?? 'testnet'),
  };

  try {
    const topicId = TopicId.fromString(topicIdStr);
    const message = JSON.stringify(payload);

    const txResponse = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .setMaxTransactionFee(new Hbar(2))
      .execute(client);

    const receipt = await txResponse.getReceipt(client);
    const txId    = txResponse.transactionId.toString();

    if (receipt.status.toString() !== 'SUCCESS') {
      console.warn(`[HCS] Audit write returned status: ${receipt.status.toString()}`);
    }

    return txId;
  } catch (err) {
    console.error('[HCS] Audit log write failed (non-blocking):', err);
    return null;
  }
}

// ── Typed event helpers ───────────────────────────────────────────────────────

export async function logKaibarMint(params: {
  recipient: string;
  amount: number;
  reason: string;
  mintTxId: string;
  transferTxId: string;
  tokenId?: string;
}): Promise<string | null> {
  return logHcsEvent({
    event:       'KAIBAR_MINT',
    tokenId:     params.tokenId ?? process.env.HEDERA_KAIBAR_TOKEN_ID,
    recipient:   params.recipient,
    amount:      params.amount,
    reason:      params.reason,
    txId:        params.mintTxId,
    transferTxId: params.transferTxId,
  });
}

export async function logConservationNftMint(params: {
  conservationId: string;
  recipient: string;
  serials: number[];
  eventType: string;
  metadataPointer: string;
  mintTxId: string;
  transferTxId: string;
  tokenId?: string;
}): Promise<string | null> {
  return logHcsEvent({
    event:       'CONSERVATION_NFT_MINT',
    recordId:    params.conservationId,
    tokenId:     params.tokenId ?? process.env.HEDERA_CONNFT_TOKEN_ID,
    serials:     params.serials,
    recipient:   params.recipient,
    txId:        params.mintTxId,
    transferTxId: params.transferTxId,
    metadata: {
      eventType:       params.eventType,
      metadataPointer: params.metadataPointer,
    },
  });
}

export async function logX402Payment(params: {
  payer: string;
  payTo: string;
  amount: number | string;
  route: string;
  paymentRef: string;
  network: string;
  txId?: string;
}): Promise<string | null> {
  return logHcsEvent({
    event:     'X402_PAYMENT',
    sender:    params.payer,
    recipient: params.payTo,
    amount:    params.amount,
    reason:    params.route,
    recordId:  params.paymentRef,
    txId:      params.txId,
    network:   params.network,
  });
}

export async function logAgentAction(params: {
  agentName: string;
  agentAddress: string;
  action: string;
  paymentRef?: string;
  amount?: number;
}): Promise<string | null> {
  return logHcsEvent({
    event:    'AGENT_ACTION',
    sender:   params.agentAddress,
    reason:   params.action,
    recordId: params.paymentRef,
    amount:   params.amount,
    metadata: { agentName: params.agentName },
  });
}
