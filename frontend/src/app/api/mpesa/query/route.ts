/**
 * POST /api/mpesa/query
 * Manually query the status of a pending STK Push from Safaricom.
 * Use this as a fallback if the callback hasn't arrived yet.
 *
 * Body: { checkoutRequestId: string }
 */

import { NextResponse } from "next/server";
import { stkQuery } from "@/lib/mpesa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { checkoutRequestId } = await request.json();

    if (!checkoutRequestId) {
      return NextResponse.json(
        { error: "checkoutRequestId is required" },
        { status: 400 },
      );
    }

    const result = await stkQuery(checkoutRequestId);

    const success = result.ResultCode === "0";

    return NextResponse.json({
      success,
      resultCode:        result.ResultCode,
      resultDesc:        result.ResultDesc,
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Query failed";
    console.error("[/api/mpesa/query]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
