/**
 * POST /api/busha/webhook
 * Receives Busha Commerce webhook events after a charge is paid/resolved.
 * Docs: https://developers.commerce.busha.co/docs/webhook-events
 *
 * This is the source of truth for payment success — never trust a
 * frontend/client claim that "payment succeeded." On a verified
 * charge.confirmed (or charge.resolved) event, this mints the Conservation
 * NFT to the buyer's Hedera account that was registered when the charge
 * was created (see /api/busha/charge).
 *
 * Configure this URL (https://your-domain/api/busha/webhook) under
 * Webhook subscriptions in the Busha Commerce dashboard, and copy the
 * per-webhook shared secret into BUSHA_WEBHOOK_SECRET.
 */

import { NextResponse } from "next/server";
import { verifyWebhookSignature, parseWebhookEvent, type BushaWebhookPayload } from "@/lib/busha";
import { takePendingPurchase, mintConservationNft } from "@/lib/nftFulfillment";

export const dynamic = "force-dynamic";

// ── In-memory payment/mint record store (replace with Prisma in production) ──
type PurchaseRecord = {
  success: boolean;
  chargeId: string;
  reference: string;
  event: string;
  amountNgn?: string;
  transactionHash?: string;
  receivedAt: string;
  nftMinted?: boolean;
  nftMintError?: string;
  mintResult?: unknown;
};

declare global {
   
  var kaiBushaPayments: Map<string, PurchaseRecord> | undefined;
}
const payments: Map<string, PurchaseRecord> =
  globalThis.kaiBushaPayments ?? (globalThis.kaiBushaPayments = new Map());

export async function POST(request: Request) {
  // Signature is computed over the RAW body — must read as text first.
  const rawBody = await request.text();
  const signature = request.headers.get("x-bc-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[/api/busha/webhook] invalid or missing signature — rejecting");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: BushaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed payload" }, { status: 400 });
  }

  const parsed = parseWebhookEvent(payload);
  const record: PurchaseRecord = {
    success: parsed.success,
    chargeId: parsed.chargeId,
    reference: parsed.reference,
    event: parsed.event,
    amountNgn: parsed.amountNgn,
    transactionHash: parsed.transactionHash,
    receivedAt: new Date().toISOString(),
  };

  if (parsed.success) {
    console.log(`[Busha OK] charge ${parsed.chargeId} confirmed — NGN ${parsed.amountNgn}`);

    const pending = takePendingPurchase(parsed.chargeId);
    if (pending) {
      try {
        const mintResult = await mintConservationNft({
          recipient: pending.hederaAccountId,
          conservationId: pending.nftId,
          metadataPointer: pending.metadataPointer,
        });
        record.nftMinted = true;
        record.mintResult = mintResult;
      } catch (err) {
        // Payment succeeded but the mint call failed — do NOT silently drop
        // this. Surface it so it can be retried/reconciled; the buyer paid
        // real money and must still receive their NFT.
        record.nftMinted = false;
        record.nftMintError = err instanceof Error ? err.message : String(err);
        console.error(`[Busha] mint failed for charge ${parsed.chargeId}:`, record.nftMintError);
      }
    } else {
      record.nftMintError = "no pending purchase found for this charge id";
      console.warn(`[Busha] charge ${parsed.chargeId} confirmed but no pending purchase was registered`);
    }
  } else {
    console.log(`[Busha] charge ${parsed.chargeId} event: ${parsed.event}`);
  }

  payments.set(parsed.chargeId, record);

  return NextResponse.json({ received: true });
}

// ── GET /api/busha/webhook?chargeId=xxx  (polling endpoint) ───────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("chargeId");

  if (!id) {
    return NextResponse.json({ error: "chargeId required" }, { status: 400 });
  }

  const record = payments.get(id);
  if (!record) {
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({ status: record.success ? "success" : "failed", ...record });
}
