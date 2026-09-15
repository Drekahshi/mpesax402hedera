/**
 * src/lib/busha.ts
 * Busha Commerce API service module (Nigerian crypto/NGN checkout).
 * Docs: https://developers.commerce.busha.co/docs/commerce-documentation
 *
 * Supports:
 *   - Creating a charge (a payment request the buyer completes on a hosted page)
 *   - Retrieving a charge's current status
 *   - Verifying + parsing incoming webhook events (charge.confirmed, etc.)
 *
 * Environment variables (set in .env.local — NEVER commit real values):
 *   BUSHA_SECRET_KEY     Business secret API key (X-BC-API-KEY header). "test_..." in sandbox.
 *   BUSHA_WEBHOOK_SECRET Per-webhook shared secret from the Busha dashboard (Webhook subscriptions)
 *   BUSHA_CALLBACK_URL   Post-payment redirect URL shown on the hosted checkout page
 *   BUSHA_NGN_PER_USD    Exchange rate used to convert NFT prices to NGN (default: 1650)
 *
 * All prices in the app are in USD/yBOB. Busha charges are created in NGN
 * using BUSHA_NGN_PER_USD, mirroring how mpesa.ts converts to KES.
 */

import crypto from "crypto";

const BASE_URL = "https://api.commerce.busha.co";

const SECRET_KEY    = process.env.BUSHA_SECRET_KEY    ?? "";
const WEBHOOK_SECRET = process.env.BUSHA_WEBHOOK_SECRET ?? "";
const CALLBACK_URL  = process.env.BUSHA_CALLBACK_URL  ?? "https://yourdomain.ngrok-free.app/busha/return";
const NGN_PER_USD   = parseFloat(process.env.BUSHA_NGN_PER_USD ?? "1650");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateChargeRequest {
  /** Amount in NGN (Busha charges local_amount as a string) */
  amountNgn: number;
  /** Custom reference for reconciliation (5-100 chars) */
  reference: string;
  /** Buyer email/name, surfaced back in the webhook payload */
  meta?: { email?: string; name?: string };
}

export interface ChargeData {
  id: string;
  reference: string;
  hosted_url: string;
  deeplink?: string;
  price_fixed: boolean;
  local_currency: string;
  local_amount: string;
  expires_at: string;
  timeline: Array<{ status: string; created_at: string }>;
  [key: string]: unknown;
}

export interface CreateChargeResponse {
  status: string;
  message: string;
  data: ChargeData;
}

// ── Create a charge ───────────────────────────────────────────────────────────

/**
 * Create a Busha charge (hosted checkout page). The buyer pays in crypto for
 * the NGN-denominated amount; Busha handles the FX. Redirect the buyer to
 * `data.hosted_url` (or use `data.deeplink` for a wallet app).
 */
export async function createCharge(req: CreateChargeRequest): Promise<CreateChargeResponse> {
  if (!SECRET_KEY) {
    throw new Error("BUSHA_SECRET_KEY must be set in .env.local");
  }

  const payload = {
    fixed_price: true,
    local_amount: req.amountNgn.toFixed(2),
    local_currency: "NGN",
    reference: req.reference.slice(0, 100),
    callback_url: CALLBACK_URL,
    ...(req.meta ? { meta: req.meta } : {}),
  };

  const res = await fetch(`${BASE_URL}/charges`, {
    method: "POST",
    headers: {
      "X-BC-API-KEY": SECRET_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Busha charge creation failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data as CreateChargeResponse;
}

// ── Retrieve a charge ─────────────────────────────────────────────────────────

export async function retrieveCharge(chargeId: string): Promise<CreateChargeResponse> {
  if (!SECRET_KEY) {
    throw new Error("BUSHA_SECRET_KEY must be set in .env.local");
  }

  const res = await fetch(`${BASE_URL}/charges/${encodeURIComponent(chargeId)}`, {
    headers: { "X-BC-API-KEY": SECRET_KEY },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Busha charge lookup failed (${res.status}): ${JSON.stringify(data)}`);
  }

  return data as CreateChargeResponse;
}

// ── Webhook signature verification ────────────────────────────────────────────

/**
 * Busha signs the raw POST body with HMAC-SHA256 (base64) using the
 * per-webhook shared secret, sent in the `X-BC-Signature` header.
 * ALWAYS verify this before acting on a webhook — never trust an unsigned
 * or mismatched payload as a real payment confirmation.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Webhook payload types ─────────────────────────────────────────────────────

export type BushaWebhookEvent =
  | "charge.created"
  | "charge.confirmed"
  | "charge.cancelled"
  | "charge.pending"
  | "charge.resolved"
  | "charge.unresolved"
  | "charge.expired"
  | "deposit.confirmed"
  | "deposit.pending"
  | "deposit.failed";

export interface BushaWebhookPayload {
  event: BushaWebhookEvent;
  data: ChargeData & {
    payments?: Array<{
      chain: string;
      amount: string;
      local_amount: string;
      local_currency: string;
      currency: string;
      transaction_id: string;
      transaction_hash?: string;
      status: string;
      confirmation?: number;
    }>;
  };
}

export interface ParsedBushaEvent {
  success: boolean;
  chargeId: string;
  reference: string;
  event: BushaWebhookEvent;
  amountNgn?: string;
  transactionHash?: string;
}

export function parseWebhookEvent(payload: BushaWebhookPayload): ParsedBushaEvent {
  const success = payload.event === "charge.confirmed" || payload.event === "charge.resolved";
  const payment = payload.data.payments?.[0];

  return {
    success,
    chargeId: payload.data.id,
    reference: payload.data.reference,
    event: payload.event,
    amountNgn: payload.data.local_amount,
    transactionHash: payment?.transaction_hash,
  };
}

// ── Conversion helper ─────────────────────────────────────────────────────────

/** Convert a yBOB/USD amount to NGN. */
export function usdToNgn(usdAmount: number): number {
  return Math.ceil(usdAmount * NGN_PER_USD * 100) / 100;
}
