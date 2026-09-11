/**
 * POST /api/mpesa/stk
 * Initiates an M-Pesa STK Push for an NFT purchase.
 *
 * Body:
 *   phone      string   Buyer's Safaricom number (2547XXXXXXXX)
 *   nftId      string   NFT id being purchased (e.g. "nft5")
 *   nftName    string   Human-readable NFT name
 *   priceYbob  number   NFT price in yBOB/USD
 *
 * Response (201):
 *   checkoutRequestId  string   Use this to query status
 *   merchantRequestId  string
 *   amountKes          number   KES amount charged
 *   message            string   Customer-facing message
 */

import { NextResponse } from "next/server";
import { stkPush, usdToKes } from "@/lib/mpesa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, nftId, nftName, priceYbob } = body as {
      phone:     string;
      nftId:     string;
      nftName:   string;
      priceYbob: number;
    };

    if (!phone || !nftId || !priceYbob) {
      return NextResponse.json(
        { error: "phone, nftId, and priceYbob are required" },
        { status: 400 },
      );
    }

    // Validate phone: must be 2547XXXXXXXX or 2541XXXXXXXX (12 digits)
    const cleanPhone = phone.replace(/\D/g, "");
    if (!/^254[17]\d{8}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: "Invalid phone number. Use format 2547XXXXXXXX" },
        { status: 400 },
      );
    }

    const amountKes = usdToKes(priceYbob);

    const result = await stkPush({
      phone:       cleanPhone,
      amountKes,
      reference:   `NFT-${nftId}`.slice(0, 12),
      description: `KAI NFT Buy`.slice(0, 13),
    });

    if (result.ResponseCode !== "0") {
      return NextResponse.json(
        { error: result.ResponseDescription },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
        amountKes,
        nftId,
        nftName,
        message:           result.CustomerMessage,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "STK push failed";
    console.error("[/api/mpesa/stk]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
