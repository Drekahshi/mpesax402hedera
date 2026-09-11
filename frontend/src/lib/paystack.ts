/**
 * src/lib/paystack.ts
 *
 * Server-side Paystack helper.  Mirrors the shape of lib/mpesa.ts so
 * existing API routes can swap with minimal surface changes.
 *
 * Required env vars (in frontend/.env.local):
 *   PAYSTACK_SECRET_KEY        Live or test secret key (sk_live_… / sk_test_…)
 *   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY  Public key — safe for the browser
 *   PAYSTACK_KES_PER_USD       Conversion rate (default: 130)
 */

const SECRET_KEY   = process.env.PAYSTACK_SECRET_KEY ?? "";
const KES_PER_USD  = parseFloat(process.env.PAYSTACK_KES_PER_USD ?? "130");
const BASE_URL     = "https://api.paystack.co";

if (!SECRET_KEY && process.env.NODE_ENV !== "test") {
  console.warn("[paystack] PAYSTACK_SECRET_KEY is not set — payments will fail.");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${SECRET_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Convert USD/yBOB amount to KES kobo (1 KES = 100 kobo). */
export function usdToKobo(usd: number): number {
  return Math.ceil(usd * KES_PER_USD * 100); // kobo
}

/** Convert USD/yBOB amount to KES whole units. */
export function usdToKes(usd: number): number {
  return Math.ceil(usd * KES_PER_USD);
}

// ── Initialize transaction ────────────────────────────────────────────────────

export interface InitializeOptions {
  email:      string;
  amountKobo: number;        // amount in kobo (KES × 100)
  reference?: string;        // unique ref; auto-generated if omitted
  callbackUrl?: string;      // redirect URL after hosted checkout
  metadata?: Record<string, unknown>;
  channels?: string[];       // e.g. ["mobile_money", "card"]
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode:       string;
  reference:        string;
}

export async function initializeTransaction(
  opts: InitializeOptions,
): Promise<InitializeResult> {
  const body: Record<string, unknown> = {
    email:    opts.email,
    amount:   opts.amountKobo,
    currency: "KES",
    channels: opts.channels ?? ["mobile_money", "card"],
  };
  if (opts.reference)  body.reference   = opts.reference;
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;
  if (opts.metadata)   body.metadata    = opts.metadata;

  const res  = await fetch(`${BASE_URL}/transaction/initialize`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify(body),
  });
  const json = await res.json();

  if (!json.status) {
    throw new Error(json.message ?? "Paystack initialize failed");
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode:       json.data.access_code,
    reference:        json.data.reference,
  };
}

// ── Verify transaction ────────────────────────────────────────────────────────

export interface PaystackTransaction {
  reference:  string;
  status:     "success" | "failed" | "abandoned" | string;
  amount:     number;     // kobo
  currency:   string;
  paidAt:     string;
  customer:   { email: string; phone?: string };
  metadata:   Record<string, unknown>;
}

export async function verifyTransaction(
  reference: string,
): Promise<PaystackTransaction> {
  const res  = await fetch(`${BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: headers(),
  });
  const json = await res.json();

  if (!json.status) {
    throw new Error(json.message ?? "Paystack verify failed");
  }

  const d = json.data;
  return {
    reference:  d.reference,
    status:     d.status,
    amount:     d.amount,
    currency:   d.currency,
    paidAt:     d.paid_at,
    customer:   { email: d.customer.email, phone: d.customer.phone },
    metadata:   d.metadata ?? {},
  };
}

// ── Transfer recipients ───────────────────────────────────────────────────────

export interface TransferRecipientOptions {
  type:          "mobile_money" | "kepss"; // Kenya: M-Pesa wallet | bank account
  name:          string;                   // recipient name (per account registration)
  accountNumber: string;                   // phone number for mobile_money, account no. for kepss
  bankCode:      string;                   // "MPESA" for mobile money; bank code for kepss
  currency?:     string;
}

export interface TransferRecipientResult {
  recipientCode: string;
  active:        boolean;
  currency:      string;
}

/**
 * Create a Paystack transfer recipient (KES). The returned recipient_code
 * must be stored and reused for all later transfers to this creator.
 */
export async function createRecipient(
  opts: TransferRecipientOptions,
): Promise<TransferRecipientResult> {
  const body = {
    type:           opts.type,
    name:           opts.name,
    account_number: opts.accountNumber,
    bank_code:      opts.bankCode,
    currency:       opts.currency ?? "KES",
  };
  const res  = await fetch(`${BASE_URL}/transferrecipient`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify(body),
  });
  const json = await res.json();

  if (!json.status) {
    throw new Error(json.message ?? "Paystack createRecipient failed");
  }

  return {
    recipientCode: json.data.recipient_code,
    active:        json.data.active,
    currency:      json.data.currency,
  };
}

/** Fetch bank codes for KES (optionally only mobile-money providers). */
export async function listBanks(currency = "KES", type?: string) {
  const qs    = `?currency=${currency}${type ? `&type=${type}` : ""}`;
  const res   = await fetch(`${BASE_URL}/bank${qs}`, { headers: headers() });
  const json  = await res.json();
  if (!json.status) throw new Error(json.message ?? "Paystack listBanks failed");
  return json.data as Array<{ name: string; code: string; type?: string; active?: boolean }>;
}

// ── Transfers ─────────────────────────────────────────────────────────────────

export interface TransferResult {
  transferCode: string;
  status:       string;   // "success" | "pending" | "failed" …
  reference:    string;
  transferredAt: string;
}

export interface InitiateTransferOptions {
  recipientCode: string;
  amountKobo:    number;  // KES × 100
  reference:     string;  // unique transfer reference
  reason?:       string;
}

/**
 * Send money to a recipient from the merchant's Paystack balance.
 * NOTE: the balance must be funded in the Paystack dashboard first.
 */
export async function initiateTransfer(
  opts: InitiateTransferOptions,
): Promise<TransferResult> {
  const res  = await fetch(`${BASE_URL}/transfer`, {
    method:  "POST",
    headers: headers(),
    body:    JSON.stringify({
      source:    "balance",
      amount:    opts.amountKobo,
      recipient: opts.recipientCode,
      reference: opts.reference,
      reason:    opts.reason,
      currency:  "KES",
    }),
  });
  const json = await res.json();

  if (!json.status) {
    throw new Error(json.message ?? "Paystack transfer failed");
  }

  return {
    transferCode:  json.data.transfer_code,
    status:        json.data.status,
    reference:     json.data.reference,
    transferredAt: json.data.transferred_at ?? "",
  };
}

export interface VerifyTransferResult {
  status:        string;
  transferCode:  string;
  reference:     string;
  amount:        number;
  currency:      string;
  failedReason?: string;
}

/** Check the current status of a transfer by its reference. */
export async function verifyTransfer(
  reference: string,
): Promise<VerifyTransferResult> {
  const res  = await fetch(`${BASE_URL}/transfer/verify/${encodeURIComponent(reference)}`, {
    headers: headers(),
  });
  const json = await res.json();

  if (!json.status) {
    throw new Error(json.message ?? "Paystack verifyTransfer failed");
  }

  return {
    status:        json.data.status,
    transferCode:  json.data.transfer_code,
    reference:     json.data.reference,
    amount:        json.data.amount,
    currency:      json.data.currency,
    failedReason:  json.data.failed_reason,
  };
}

// ── Webhook signature check ───────────────────────────────────────────────────

import crypto from "crypto";

/**
 * Verify that an incoming webhook request genuinely came from Paystack.
 * Call with the raw request body (as a string/Buffer) and the
 * x-paystack-signature header value.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
): boolean {
  const hash = crypto
    .createHmac("sha512", SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  return hash === signature;
}
