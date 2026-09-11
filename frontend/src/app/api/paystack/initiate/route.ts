/**
 * POST /api/paystack/initiate
 *
 * Initialises a Paystack transaction and returns the hosted checkout URL.
 * The frontend opens this URL (popup or redirect) so the customer can pay
 * with M-Pesa mobile money, card, or any channel Paystack enables.
 *
 * Body:
 *   email      string   Customer email (required by Paystack)
 *   priceUsd   number   Amount in USD/yBOB
 *   reference  string   Unique ref — e.g. "NFT-nft5-<uuid>"
 *   nftId?     string
 *   nftName?   string
 *   wallet?    string   Buyer's on-chain wallet address
 *
 * Response (201):
 *   authorizationUrl  string   Open this URL to pay
 *   reference         string   Use this to poll /verify
 *   amountKes         number   KES amount charged
 */

import { NextResponse } from "next/server";
import { initializeTransaction, usdToKobo, usdToKes } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, priceUsd, reference, nftId, nftName, wallet } = body as {
      email:    string;
      priceUsd: number;
      reference: string;
      nftId?:   string;
      nftName?: string;
      wallet?:  string;
    };

    if (!email || !priceUsd || !reference) {
      return NextResponse.json(
        { error: "email, priceUsd, and reference are required" },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 },
      );
    }

    const amountKobo = usdToKobo(priceUsd);
    const amountKes  = usdToKes(priceUsd);

    // Persist a pending payment record in Neon
    await prisma.payment.upsert({
      where:  { reference },
      create: {
        id:              reference,
        reference,
        amount_subunits: BigInt(amountKobo),
        currency:        "KES",
        status:          "pending",
        email,
        nft_id:          nftId,
        nft_name:        nftName,
        wallet,
        metadata:        { priceUsd },
      },
      update: { status: "pending" },
    });

    const result = await initializeTransaction({
      email,
      amountKobo,
      reference,
      metadata:  { nftId, nftName, wallet, priceUsd },
      channels:  ["mobile_money", "card"],
    });

    return NextResponse.json(
      {
        authorizationUrl: result.authorizationUrl,
        reference:        result.reference,
        amountKes,
        amountKobo,
        nftId,
        nftName,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Paystack initiate failed";
    console.error("[/api/paystack/initiate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
