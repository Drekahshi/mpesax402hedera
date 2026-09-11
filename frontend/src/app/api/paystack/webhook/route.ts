/**
 * POST /api/paystack/webhook
 *
 * Paystack sends this when a payment is completed, failed, or refunded.
 * In Paystack Dashboard → Settings → Webhooks, add:
 *   https://<your-domain>/api/paystack/webhook
 *
 * This route:
 *   1. Verifies the x-paystack-signature HMAC
 *   2. Handles charge.success — marks payment success in Neon Postgres
 *   3. Returns 200 immediately (Paystack retries if it doesn't get 200)
 */

import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Paystack needs the raw body for HMAC verification — disable body parsing.
export const config = { api: { bodyParser: false } };

export async function POST(request: Request) {
  try {
    const rawBody  = await request.text();
    const sigHeader = request.headers.get("x-paystack-signature") ?? "";

    if (!verifyWebhookSignature(rawBody, sigHeader)) {
      console.warn("[/api/paystack/webhook] Invalid signature — ignored.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      data: {
        reference:  string;
        status:     string;
        amount:     number;
        currency:   string;
        paid_at:    string;
        customer:   { email: string; phone?: string };
        metadata?:  Record<string, unknown>;
      };
    };

    const { event: eventName, data } = event;

    if (eventName === "charge.success") {
      await prisma.payment.updateMany({
        where: { reference: data.reference },
        data:  {
          status:   "success",
          // JSON round-trip converts Record<string,unknown> → Prisma-safe InputJsonValue
          metadata: JSON.parse(JSON.stringify({
            paidAt:      data.paid_at,
            email:       data.customer.email,
            amountKobo:  data.amount,
            paystackMeta: data.metadata ?? null,
          })),
        },
      });
      console.log(`[paystack/webhook] charge.success — ref: ${data.reference}`);
    } else if (eventName === "charge.failed") {
      await prisma.payment.updateMany({
        where: { reference: data.reference },
        data:  { status: "failed" },
      });
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook error";
    console.error("[/api/paystack/webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
