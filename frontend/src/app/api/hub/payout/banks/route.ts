/**
 * GET /api/hub/payout/banks
 * Returns the Paystack bank/mobile-money codes for KES, used by the
 * creator payout registration form. Mobile-money providers (code "MPESA")
 * are split out so the form can offer M-Pesa or a bank account.
 */

import { NextResponse } from "next/server";
import { listBanks } from "@/lib/paystack";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const banks = await listBanks("KES");
    const mobileMoney = banks.filter(b => b.type === 'mobile_money');
    const bankAccounts = banks.filter(b => b.type !== 'mobile_money' && b.active !== false);
    return NextResponse.json({ banks, mobileMoney, bankAccounts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch banks";
    console.error("[/api/hub/payout/banks]", message);
    return NextResponse.json({ error: message, banks: [], mobileMoney: [], bankAccounts: [] }, { status: 500 });
  }
}