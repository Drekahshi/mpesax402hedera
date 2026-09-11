/**
 * POST /api/hub/payout/register
 * Registers (or updates) a Hub creator's payout account with Paystack.
 *
 * Creates a Paystack transfer recipient for the creator so approved tips
 * can be auto-sent to them. M-Pesa is the primary path for KES
 * (type "mobile_money", bank_code "MPESA", account_number = phone).
 *
 * Body:
 *   name          string   Creator display name (unique)
 *   payoutType    "mobile_money" | "kepss"
 *   accountNumber string   Phone number (mobile_money) or bank account number (kepss)
 *   bankCode      string   "MPESA" or the bank's Paystack code
 *   accountName?  string
 *
 * Response (201):
 *   recipientCode  string
 *   creator        string
 *   payoutType     string
 */

import { NextResponse } from "next/server";
import { createRecipient } from "@/lib/paystack";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TYPES = ["mobile_money", "kepss"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, payoutType, accountNumber, bankCode, accountName } = body as {
      name:          string;
      payoutType:    string;
      accountNumber: string;
      bankCode:      string;
      accountName?:  string;
    };

    if (!name || !accountNumber || !bankCode) {
      return NextResponse.json(
        { error: "name, accountNumber and bankCode are required" },
        { status: 400 },
      );
    }

    const type = TYPES.includes(payoutType as typeof TYPES[number])
      ? (payoutType as typeof TYPES[number])
      : "mobile_money";

    const recipient = await createRecipient({
      type,
      name,
      accountNumber,
      bankCode,
      currency: "KES",
    });

    await prisma.creatorPayout.upsert({
      where:  { name },
      create: {
        name,
        payoutType:    type,
        bankCode,
        accountNumber,
        accountName:   accountName ?? name,
        recipientCode: recipient.recipientCode,
        currency:      "KES",
      },
      update: {
        payoutType:    type,
        bankCode,
        accountNumber,
        accountName:   accountName ?? name,
        recipientCode: recipient.recipientCode,
      },
    });

    return NextResponse.json(
      {
        recipientCode: recipient.recipientCode,
        creator:       name,
        payoutType:    type,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Payout register failed";
    console.error("[/api/hub/payout/register]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}