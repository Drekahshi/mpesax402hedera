/**
 * POST /api/hub/tip
 * Initiates a Paystack checkout for tipping a Hub creator.
 *
 * The user pays KES (M-Pesa mobile money or card) via Paystack's
 * hosted checkout; the frontend then polls /api/paystack/verify.
 *
 * Body:
 *   email      string   Payer's email (required by Paystack)
 *   amountKes  number   Tip amount in KES
 *   creator    string   Creator receiving the tip
 *   postTitle? string
 *   slug?      string
 *
 * Response (201):
 *   authorizationUrl  string   Open this URL to pay
 *   reference         string   Use this to poll /verify
 *   amountKes         number   KES amount charged
 */

import { NextResponse } from "next/server";
import { initializeTransaction } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, amountKes, creator, postTitle, slug } = body as {
      email:     string;
      amountKes: number;
      creator:   string;
      postTitle?: string;
      slug?:     string;
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!creator || !amountKes || Number(amountKes) < 1) {
      return NextResponse.json({ error: "creator and amountKes are required" }, { status: 400 });
    }

    const amountKesInt = Math.round(Number(amountKes));
    const amountKobo   = amountKesInt * 100; // Paystack amounts are in kobo (KES × 100)
    const reference    = `TIP-${(slug ?? "hub").slice(0, 6).toUpperCase()}-${Date.now().toString(36)}`;

    await prisma.payment.upsert({
      where:  { reference },
      create: {
        id:              reference,
        reference,
        amount_subunits: BigInt(amountKobo),
        currency:        "KES",
        status:          "pending",
        email,
        nft_name:        `Hub tip for ${creator}`,
        metadata:        { type: "hub_tip", creator, postTitle, amountKes: amountKesInt },
      },
      update: { status: "pending" },
    });

    const result = await initializeTransaction({
      email:      email,
      amountKobo,
      reference,
      metadata:   { type: "hub_tip", creator, postTitle, slug, tipKes: amountKesInt },
      channels:   ["mobile_money", "card"],
    });

    return NextResponse.json(
      {
        authorizationUrl: result.authorizationUrl,
        reference:        result.reference,
        amountKes:        amountKesInt,
        creator,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Tip initiate failed";
    console.error("[/api/hub/tip]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}