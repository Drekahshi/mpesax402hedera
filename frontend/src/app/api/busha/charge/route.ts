/**
 * POST /api/busha/charge
 * Creates a Busha hosted checkout charge for an NFT purchase (Nigeria rail).
 * Mirrors /api/mpesa/stk — same NFT-purchase shape, different payment rail.
 *
 * Body:
 *   hederaAccountId   string   Buyer's Hedera account (e.g. "0.0.12345") — NFT destination
 *   nftId             string   NFT id being purchased (e.g. "nft5")
 *   nftName           string   Human-readable NFT name
 *   priceYbob         number   NFT price in yBOB/USD
 *   metadataPointer   string   IPFS/CDN pointer for this NFT's metadata
 *   email, name       string   Optional buyer info (passed to Busha as `meta`)
 *
 * Response (201):
 *   chargeId    string   Use this to poll status or match the webhook
 *   hostedUrl   string   Redirect the buyer here to complete payment
 *   amountNgn   number
 */

import { NextResponse } from "next/server";
import { createCharge, usdToNgn } from "@/lib/busha";
import { registerPendingPurchase } from "@/lib/nftFulfillment";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hederaAccountId, nftId, nftName, priceYbob, metadataPointer, email, name } = body as {
      hederaAccountId: string;
      nftId: string;
      nftName: string;
      priceYbob: number;
      metadataPointer: string;
      email?: string;
      name?: string;
    };

    if (!hederaAccountId || !nftId || !priceYbob || !metadataPointer) {
      return NextResponse.json(
        { error: "hederaAccountId, nftId, priceYbob, and metadataPointer are required" },
        { status: 400 },
      );
    }

    if (!/^\d+\.\d+\.\d+$/.test(hederaAccountId)) {
      return NextResponse.json(
        { error: "Invalid hederaAccountId. Use Hedera format 0.0.xxxxx" },
        { status: 400 },
      );
    }

    const amountNgn = usdToNgn(priceYbob);

    const result = await createCharge({
      amountNgn,
      reference: `NFT-${nftId}-${Date.now()}`,
      meta: { email, name },
    });

    registerPendingPurchase(result.data.id, {
      nftId,
      hederaAccountId,
      metadataPointer,
      rail: "BUSHA",
    });

    return NextResponse.json(
      {
        chargeId: result.data.id,
        hostedUrl: result.data.hosted_url,
        deeplink: result.data.deeplink,
        amountNgn,
        nftId,
        nftName,
        expiresAt: result.data.expires_at,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Busha charge creation failed";
    console.error("[/api/busha/charge]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
