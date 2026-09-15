/**
 * POST /api/mpesa/b2c
 * Send money FROM the business/paybill TO a Safaricom phone number.
 * This is M-Pesa Business to Customer (B2C) — used for "send money" flows.
 *
 * Body:
 *   phone         string   Recipient Safaricom number (2547XXXXXXXX)
 *   amountKes     number   KES amount to send (integer)
 *   occasion      string   Short description (max 100 chars)
 *   remarks       string   Remarks (max 100 chars)
 *
 * ⚠️  B2C requires:
 *   - MPESA_B2C_SHORTCODE   (the initiator shortcode, usually same as MPESA_SHORTCODE)
 *   - MPESA_INITIATOR_NAME  (API user registered on Safaricom portal)
 *   - MPESA_SECURITY_CRED   (Base64 of RSA-encrypted initiator password)
 *   - MPESA_B2C_RESULT_URL  (public HTTPS URL for result callback)
 *   - MPESA_B2C_TIMEOUT_URL (public HTTPS URL for timeout callback)
 *
 * In sandbox, use test credentials from the Daraja developer portal.
 *
 * Security: this sends real money to an arbitrary phone number — gated by
 * the same INTERNAL_SERVICE_KEY as /api/hedera. Never expose this directly
 * to end users; only trusted server-side logic (e.g. a refund flow) should
 * call it.
 */

import { NextResponse } from "next/server";
import { b2cSend } from "@/lib/mpesa";

export const dynamic = "force-dynamic";

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";
const B2C_PER_TX_CAP_KES = 5000; // hard ceiling — raise deliberately, never remove

export async function POST(request: Request) {
  if (!INTERNAL_KEY) {
    return NextResponse.json({ error: "INTERNAL_SERVICE_KEY is not configured on the server" }, { status: 503 });
  }
  if (request.headers.get("x-internal-key") !== INTERNAL_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { phone, amountKes, occasion, remarks } = body as {
      phone:     string;
      amountKes: number;
      occasion?: string;
      remarks?:  string;
    };

    if (!phone || !amountKes) {
      return NextResponse.json(
        { error: "phone and amountKes are required" },
        { status: 400 },
      );
    }

    const clean = phone.replace(/\D/g, "");
    if (!/^254[17]\d{8}$/.test(clean)) {
      return NextResponse.json(
        { error: "Invalid phone number. Use format 2547XXXXXXXX" },
        { status: 400 },
      );
    }

    const amount = Math.max(10, Math.round(amountKes));  // B2C minimum is KES 10
    if (amount > B2C_PER_TX_CAP_KES) {
      return NextResponse.json(
        { error: `Per-tx cap: max KES ${B2C_PER_TX_CAP_KES}` },
        { status: 400 },
      );
    }

    const result = await b2cSend({
      phone:    clean,
      amountKes: amount,
      occasion:  (occasion ?? "KAI Send").slice(0, 100),
      remarks:   (remarks  ?? "KAI platform payment").slice(0, 100),
    });

    if (result.ResponseCode !== "0") {
      return NextResponse.json(
        { error: result.ResponseDescription },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        conversationId:        result.ConversationID,
        originatorConversationId: result.OriginatorConversationID,
        responseDescription:   result.ResponseDescription,
        phone:                 clean,
        amountKes:             amount,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "B2C send failed";
    console.error("[/api/mpesa/b2c]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
