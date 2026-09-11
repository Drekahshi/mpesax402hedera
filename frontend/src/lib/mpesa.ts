/**
 * src/lib/mpesa.ts
 * M-Pesa Daraja API service module (Safaricom Kenya).
 *
 * Supports:
 *   - OAuth token generation (cached, auto-refreshed)
 *   - STK Push (Lipa Na M-Pesa Online) — prompts user's phone to enter PIN
 *   - STK Query — check status of a pending STK push
 *   - C2B callback parsing — validates incoming IPN payloads
 *
 * Environment variables (set in .env.local — NEVER commit real values):
 *   MPESA_CONSUMER_KEY       Daraja app consumer key
 *   MPESA_CONSUMER_SECRET    Daraja app consumer secret
 *   MPESA_SHORTCODE          Business / Paybill short code
 *   MPESA_PASSKEY            Lipa Na M-Pesa online passkey
 *   MPESA_CALLBACK_URL       Public HTTPS URL that Safaricom POSTs to
 *   MPESA_ENV                "sandbox" | "production" (default: sandbox)
 *
 * All prices in the app are in USD/yBOB. The STK push amount is in KES.
 * Use the MPESA_KES_PER_USD rate to convert.
 *   MPESA_KES_PER_USD        Exchange rate (default: 130)
 */

const ENV         = process.env.MPESA_ENV ?? "sandbox";
const BASE_URL    = ENV === "production"
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const CONSUMER_KEY    = process.env.MPESA_CONSUMER_KEY    ?? "";
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET ?? "";
const SHORTCODE       = process.env.MPESA_SHORTCODE        ?? "174379"; // sandbox default
const PASSKEY         = process.env.MPESA_PASSKEY          ?? "";
const CALLBACK_URL    = process.env.MPESA_CALLBACK_URL     ?? "https://yourdomain.ngrok-free.app/api/mpesa/callback";
const KES_PER_USD     = parseFloat(process.env.MPESA_KES_PER_USD ?? "130");

// ── Token cache ───────────────────────────────────────────────────────────────
let _token:     string = "";
let _tokenExp:  number = 0;

export async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _tokenExp) return _token;

  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error("MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set in .env.local");
  }

  const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");

  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`M-Pesa OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: string };
  _token    = data.access_token;
  _tokenExp = Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000; // 1-min buffer
  return _token;
}

// ── Timestamp & password helpers ─────────────────────────────────────────────

function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
}

function getPassword(timestamp: string): string {
  // Daraja password = Base64(Shortcode + Passkey + Timestamp)
  return Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString("base64");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface STKPushRequest {
  /** E.164 format: 2547XXXXXXXX */
  phone: string;
  /** Amount in KES (integers only — M-Pesa requirement) */
  amountKes: number;
  /** Order / reference ID for reconciliation (max 12 chars, alphanumeric) */
  reference: string;
  /** Human-readable description (max 13 chars) */
  description: string;
}

export interface STKPushResponse {
  MerchantRequestID:  string;
  CheckoutRequestID:  string;
  ResponseCode:       string;
  ResponseDescription:string;
  CustomerMessage:    string;
}

export interface STKQueryResponse {
  ResponseCode:       string;
  ResponseDescription:string;
  MerchantRequestID:  string;
  CheckoutRequestID:  string;
  ResultCode:         string;
  ResultDesc:         string;
}

export interface MpesaCallback {
  Body: {
    stkCallback: {
      MerchantRequestID:  string;
      CheckoutRequestID:  string;
      ResultCode:         number;
      ResultDesc:         string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
}

// ── STK Push ──────────────────────────────────────────────────────────────────

/**
 * Initiate an STK Push (Lipa Na M-Pesa Online).
 * The user receives a prompt on their phone to enter their M-Pesa PIN.
 */
export async function stkPush(req: STKPushRequest): Promise<STKPushResponse> {
  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const password  = getPassword(timestamp);

  // Clamp to integer KES (M-Pesa rejects decimals)
  const amount = Math.max(1, Math.round(req.amountKes));

  const payload = {
    BusinessShortCode: SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   "CustomerPayBillOnline",
    Amount:            amount,
    PartyA:            req.phone,
    PartyB:            SHORTCODE,
    PhoneNumber:       req.phone,
    CallBackURL:       CALLBACK_URL,
    AccountReference:  req.reference.slice(0, 12),
    TransactionDesc:   req.description.slice(0, 13),
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STK Push failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<STKPushResponse>;
}

// ── STK Query ─────────────────────────────────────────────────────────────────

/**
 * Check the status of a pending STK Push.
 * Call this ~10 seconds after stkPush() to see if the user confirmed.
 */
export async function stkQuery(checkoutRequestId: string): Promise<STKQueryResponse> {
  const token     = await getAccessToken();
  const timestamp = getTimestamp();
  const password  = getPassword(timestamp);

  const res = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`STK Query failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<STKQueryResponse>;
}

// ── Callback parser ───────────────────────────────────────────────────────────

export interface ParsedCallback {
  success:          boolean;
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode:       number;
  resultDesc:       string;
  amount?:          number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?:     string;
}

export function parseCallback(body: MpesaCallback): ParsedCallback {
  const cb = body.Body.stkCallback;
  const success = cb.ResultCode === 0;
  const meta    = cb.CallbackMetadata?.Item ?? [];

  const get = (name: string) => meta.find(i => i.Name === name)?.Value;

  return {
    success,
    checkoutRequestId:  cb.CheckoutRequestID,
    merchantRequestId:  cb.MerchantRequestID,
    resultCode:         cb.ResultCode,
    resultDesc:         cb.ResultDesc,
    amount:             success ? Number(get("Amount"))              : undefined,
    mpesaReceiptNumber: success ? String(get("MpesaReceiptNumber") ?? "") : undefined,
    transactionDate:    success ? String(get("TransactionDate") ?? "")    : undefined,
    phoneNumber:        success ? String(get("PhoneNumber") ?? "")         : undefined,
  };
}

// ── Conversion helper ─────────────────────────────────────────────────────────

/** Convert a yBOB/USD amount to KES (rounded up to nearest integer). */
export function usdToKes(usdAmount: number): number {
  return Math.ceil(usdAmount * KES_PER_USD);
}

// ── B2C (Business to Customer) — send money TO a phone ───────────────────────

const B2C_SHORTCODE   = process.env.MPESA_B2C_SHORTCODE   ?? SHORTCODE;
const INITIATOR_NAME  = process.env.MPESA_INITIATOR_NAME  ?? "testapi";
const SECURITY_CRED   = process.env.MPESA_SECURITY_CRED   ?? "";
const B2C_RESULT_URL  = process.env.MPESA_B2C_RESULT_URL  ?? `${CALLBACK_URL.replace("/callback","")}/b2c/result`;
const B2C_TIMEOUT_URL = process.env.MPESA_B2C_TIMEOUT_URL ?? `${CALLBACK_URL.replace("/callback","")}/b2c/timeout`;

export interface B2CSendRequest {
  /** Recipient Safaricom number (2547XXXXXXXX) */
  phone: string;
  /** Amount in KES (integers only) */
  amountKes: number;
  /** Short description shown to recipient */
  occasion: string;
  /** Internal remarks for reconciliation */
  remarks: string;
}

export interface B2CSendResponse {
  ConversationID:             string;
  OriginatorConversationID:   string;
  ResponseCode:               string;
  ResponseDescription:        string;
}

/**
 * Send money to a recipient's M-Pesa wallet (B2C SalaryPayment).
 * Requires MPESA_INITIATOR_NAME and MPESA_SECURITY_CRED set in .env.local.
 *
 * In sandbox: use the Daraja test credentials — no real money moves.
 * In production: requires an approved B2C shortcode from Safaricom.
 */
export async function b2cSend(req: B2CSendRequest): Promise<B2CSendResponse> {
  if (!INITIATOR_NAME) {
    throw new Error(
      "MPESA_INITIATOR_NAME must be set in .env.local for B2C payments.",
    );
  }
  if (!SECURITY_CRED) {
    throw new Error(
      "MPESA_SECURITY_CRED must be set in .env.local. " +
      "Generate it by RSA-encrypting your initiator password with the Safaricom public cert.",
    );
  }

  const token = await getAccessToken();
  const amount = Math.max(10, Math.round(req.amountKes));

  const payload = {
    InitiatorName:          INITIATOR_NAME,
    SecurityCredential:     SECURITY_CRED,
    CommandID:              "SalaryPayment",  // or "BusinessPayment" / "PromotionPayment"
    Amount:                 amount,
    PartyA:                 B2C_SHORTCODE,
    PartyB:                 req.phone,
    Remarks:                req.remarks.slice(0, 100),
    QueueTimeOutURL:        B2C_TIMEOUT_URL,
    ResultURL:              B2C_RESULT_URL,
    Occasion:               req.occasion.slice(0, 100),
  };

  const res = await fetch(`${BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2C request failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<B2CSendResponse>;
}
