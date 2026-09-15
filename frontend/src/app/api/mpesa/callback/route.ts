/**
 * POST /api/mpesa/callback
 * Receives Safaricom IPN (Instant Payment Notification) after the user
 * confirms or cancels the STK push on their phone.
 *
 * Safaricom POSTs to this URL automatically. It must be:
 *   - Publicly reachable over HTTPS
 *   - For local dev: use  ngrok http 3000  and set MPESA_CALLBACK_URL
 *
 * On success:
 *   - Logs the payment receipt
 *   - Marks the order as paid in the in-memory store (replace with DB)
 *   - Returns HTTP 200 with {"ResultCode":"00","ResultDesc":"Success"}
 *
 * On failure (user cancelled / timeout):
 *   - Logs the failure and returns 200 (Safaricom requires 200 always)
 */

import { NextResponse } from "next/server";
import { parseCallback, type MpesaCallback } from "@/lib/mpesa";
import { takePendingPurchase, mintConservationNft } from "@/lib/nftFulfillment";

export const dynamic = "force-dynamic";

// ── In-memory payment store (replace with Prisma in production) ───────────────
// Maps checkoutRequestId → payment result
type PaymentRecord = {
  success:            boolean;
  checkoutRequestId:  string;
  amount?:            number;
  mpesaReceiptNumber?: string;
  phoneNumber?:       string;
  transactionDate?:   string;
  resultDesc:         string;
  receivedAt:         string;
  nftMinted?:         boolean;
  nftMintError?:      string;
  mintResult?:        unknown;
};

declare global {
   
  var kaiMpesaPayments: Map<string, PaymentRecord> | undefined;
}
const payments: Map<string, PaymentRecord> =
  globalThis.kaiMpesaPayments ?? (globalThis.kaiMpesaPayments = new Map());

export async function POST(request: Request) {
  let body: MpesaCallback;

  try {
    body = (await request.json()) as MpesaCallback;
  } catch {
    // Safaricom sometimes sends malformed JSON — always respond 200
    return NextResponse.json({ ResultCode: "00", ResultDesc: "Accepted" });
  }

  try {
    const parsed = parseCallback(body);

    const record: PaymentRecord = {
      ...parsed,
      receivedAt: new Date().toISOString(),
    };

    if (parsed.success) {
      console.log(
        `[M-Pesa OK] Receipt: ${parsed.mpesaReceiptNumber} | ` +
        `KES ${parsed.amount} from ${parsed.phoneNumber}`,
      );

      const pending = takePendingPurchase(parsed.checkoutRequestId);
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
          console.error(`[M-Pesa] mint failed for ${parsed.checkoutRequestId}:`, record.nftMintError);
        }
      } else {
        record.nftMintError = "no pending purchase found for this checkoutRequestId";
        console.warn(`[M-Pesa] payment confirmed but no pending purchase was registered for ${parsed.checkoutRequestId}`);
      }
    } else {
      console.log(
        `[M-Pesa FAIL] ${parsed.resultDesc} (code ${parsed.resultCode})`,
      );
    }

    payments.set(parsed.checkoutRequestId, record);
  } catch (err) {
    console.error("[/api/mpesa/callback] parse error:", err);
  }

  // Safaricom requires HTTP 200 with this exact body on every callback
  return NextResponse.json({ ResultCode: "00", ResultDesc: "Success" });
}

// ── GET /api/mpesa/callback?checkoutRequestId=xxx  (polling endpoint) ─────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("checkoutRequestId");

  if (!id) {
    return NextResponse.json({ error: "checkoutRequestId required" }, { status: 400 });
  }

  const record = payments.get(id);
  if (!record) {
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({ status: record.success ? "success" : "failed", ...record });
}
