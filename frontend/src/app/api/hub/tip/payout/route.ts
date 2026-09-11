/**
 * POST /api/hub/tip/payout  { reference }
 *
 * Auto-disburses a confirmed Hub tip to the creator via Paystack Transfer.
 * Steps:
 *   1. Load the Payment by reference; it must exist, type hub_tip,
 *      status "success", and not already be paid out.
 *   2. Look up the creator's registered payout account (CreatorPayout).
 *   3. If the creator has no account, mark the tip payoutStatus "pending"
 *      and return { status: "no_account" }.
 *   4. Otherwise initiate a Paystack transfer of the full tip amount from
 *      the merchant balance to the creator's recipient_code.
 *
 * Response:
 *   status   "paid" | "no_account" | "already_paid"
 *   creator  string
 */

import { NextResponse } from "next/server";
import { initiateTransfer } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { reference } = body as { reference?: string };

    if (!reference) {
      return NextResponse.json({ error: "reference is required" }, { status: 400 });
    }

    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "success") {
      return NextResponse.json({ error: "Tip is not confirmed as paid yet" }, { status: 409 });
    }

    const meta = (payment.metadata ?? {}) as {
      type?: string;
      creator?: string;
      payoutStatus?: string;
      transferCode?: string;
    };

    if (meta.type !== "hub_tip") {
      return NextResponse.json({ error: "Not a hub tip" }, { status: 400 });
    }

    if (meta.payoutStatus === "paid") {
      return NextResponse.json({ status: "already_paid", creator: meta.creator });
    }

    const creator = meta.creator ?? "";
    const payout  = await prisma.creatorPayout.findUnique({ where: { name: creator } });

    if (!payout?.recipientCode) {
      await prisma.payment.update({
        where: { id: payment.id },
        data:  { metadata: { ...meta, payoutStatus: "pending" } },
      });
      return NextResponse.json({ status: "no_account", creator });
    }

    const amountKobo = Number(payment.amount_subunits); // already KES × 100
    const transfer   = await initiateTransfer({
      recipientCode: payout.recipientCode,
      amountKobo,
      reference:     `TP-${reference}`,
      reason:        `Hub tip for ${creator}`,
    });

    await prisma.payment.update({
      where:  { id: payment.id },
      data:   {
        metadata: { ...meta, payoutStatus: "paid", transferCode: transfer.transferCode },
      },
    });

    return NextResponse.json({
      status:       "paid",
      creator,
      transferCode: transfer.transferCode,
      transferStatus: transfer.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Payout failed";
    console.error("[/api/hub/tip/payout]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}