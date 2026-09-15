/**
 * src/lib/nftFulfillment.ts
 * Shared "payment verified -> mint Conservation NFT" step for every fiat rail
 * (M-Pesa, Busha, ...). X402 has its own on-chain settlement path and does not
 * use this — this module exists specifically for rails where the money moves
 * off-chain first and the NFT is only minted after an async webhook/callback
 * confirms the payment.
 *
 * Flow: create payment (rail-specific) -> registerPendingPurchase(key, ...)
 *       -> webhook/callback fires -> takePendingPurchase(key) -> mintConservationNft()
 *
 * The pending-purchase map is in-memory (fine for a single dev/demo process —
 * replace with a DB table if this needs to survive server restarts).
 */

const RAG_API_URL = process.env.RAG_API_URL ?? "http://localhost:8000";
const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

export type PendingRail = "MPESA" | "BUSHA";

export interface PendingNftPurchase {
  nftId: string;
  hederaAccountId: string;
  metadataPointer: string;
  rail: PendingRail;
  createdAt: string;
}

declare global {
   
  var kaiPendingNftPurchases: Map<string, PendingNftPurchase> | undefined;
}

const pending: Map<string, PendingNftPurchase> =
  globalThis.kaiPendingNftPurchases ?? (globalThis.kaiPendingNftPurchases = new Map());

/** Call right after a payment request (STK push / Busha charge) is created. */
export function registerPendingPurchase(key: string, purchase: Omit<PendingNftPurchase, "createdAt">) {
  pending.set(key, { ...purchase, createdAt: new Date().toISOString() });
}

/** Look up without removing (safe to call multiple times, e.g. from a status poll). */
export function peekPendingPurchase(key: string): PendingNftPurchase | undefined {
  return pending.get(key);
}

/** Look up and remove — call this once, at the point you actually mint. */
export function takePendingPurchase(key: string): PendingNftPurchase | undefined {
  const p = pending.get(key);
  if (p) pending.delete(key);
  return p;
}

export interface MintResult {
  simulated?: boolean;
  transaction_id?: string;
  serials?: number[];
  note?: string;
  [key: string]: unknown;
}

/**
 * Mint a Conservation NFT to the buyer's Hedera account.
 * Idempotency key = conservationId (the backend/hedera_rails.py enforces this),
 * so it is safe to retry this call if the fetch itself fails or times out.
 *
 * If HEDERA_CONNFT_TOKEN_ID isn't configured on the agent backend yet, this
 * returns { simulated: true, ... } instead of throwing — that's expected
 * during development before a real Hedera testnet token exists.
 */
export async function mintConservationNft(params: {
  recipient: string;
  conservationId: string;
  metadataPointer: string;
  count?: number;
}): Promise<MintResult> {
  const res = await fetch(`${RAG_API_URL}/agents/hedera/mint/connft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": INTERNAL_KEY },
    body: JSON.stringify({
      recipient: params.recipient,
      conservation_id: params.conservationId,
      event_type: "nft_purchase",
      metadata_pointer: params.metadataPointer,
      count: params.count ?? 1,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json().catch(() => ({}))) as MintResult;
  if (!res.ok) {
    throw new Error(
      `NFT mint failed (${res.status}): ${(data as { detail?: string }).detail ?? JSON.stringify(data)}`,
    );
  }
  return data;
}
