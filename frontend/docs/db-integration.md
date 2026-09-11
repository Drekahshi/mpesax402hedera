# KAI Protocol — Database Integration Reference

> **Stack:** Neon Postgres (serverless) · Prisma ORM · Paystack payments  
> **Last updated:** 2026-09-01

---

## Table of Contents

1. [Overview](#overview)
2. [Environment Variables](#environment-variables)
3. [Prisma Setup](#prisma-setup)
4. [Schema Reference](#schema-reference)
5. [Payment Lifecycle](#payment-lifecycle)
6. [API Routes](#api-routes)
7. [Querying the DB (examples)](#querying-the-db-examples)
8. [Operational Runbook](#operational-runbook)

---

## Overview

```
Browser  ──POST──►  /api/paystack/initiate  ──► Paystack API  ──► authorizationUrl
                          │
                          ▼
                    Neon Postgres (payments table)
                    status = "pending"

Paystack Checkout (new tab)
         │  on success
         ▼
POST ──► /api/paystack/webhook  (charge.success)
                │
                ▼
         Neon Postgres
         status = "success"

Browser polls ──GET──► /api/paystack/verify?reference=<ref>
                          │  reads DB, confirms to UI
```

- All payment records are **persisted in Neon Postgres** before the user is sent to Paystack.
- The webhook is the **authoritative** confirmation channel.
- The frontend poll (`/api/paystack/verify`) is a convenience fallback for the UI.

---

## Environment Variables

Create `frontend/.env.local` (never commit this file):

```env
# ── Neon Postgres ─────────────────────────────────────────────────────────────
# Pooled connection (used by Prisma at runtime via PgBouncer)
DATABASE_URL="postgresql://neondb_owner:<password>@<host>-pooler.neon.tech/neondb?sslmode=require"

# Direct connection (used by Prisma CLI: migrate, db push, generate)
DIRECT_URL="postgresql://neondb_owner:<password>@<host>.neon.tech/neondb?sslmode=require"

# ── Paystack ──────────────────────────────────────────────────────────────────
PAYSTACK_SECRET_KEY="your_paystack_secret_key_here"
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY="your_paystack_public_key_here"

# Optional: override KES/USD rate (default: 130)
# PAYSTACK_KES_PER_USD=130
```

> **Why two Postgres URLs?**  
> Neon's pooled URL (`-pooler`) uses PgBouncer in transaction mode — essential for
> serverless (Vercel) to avoid "too many connections". The direct URL bypasses the
> pooler for schema migrations that need a persistent session.

---

## Prisma Setup

```
frontend/
├── prisma/
│   └── schema.prisma        ← single source of truth for DB schema
└── src/
    └── lib/
        └── prisma.ts        ← singleton Prisma client
```

### `src/lib/prisma.ts`

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

> The singleton pattern prevents Next.js hot-reload from opening thousands of DB
> connections in development.

### Common CLI commands

```bash
# Push schema changes to Neon (dev — no migration history needed)
npx prisma db push

# Re-generate the Prisma client after schema changes
npx prisma generate

# Open Prisma Studio (GUI to browse/edit rows)
npx prisma studio

# Full migration (production — creates a versioned migration file)
npx prisma migrate dev --name "describe-change"
```

---

## Schema Reference

File: `prisma/schema.prisma`

### `payments` table

```prisma
model Payment {
  id              String   @id @default(cuid())
  reference       String   @unique          // Paystack reference, e.g. "KAI-1725138000000-abc12"
  amount_subunits BigInt   @default(0)      // Amount in kobo (KES × 100)
  currency        String   @default("KES")
  status          String   @default("pending")  // "pending" | "success" | "failed" | "abandoned"
  email           String?                   // Customer email (required by Paystack)
  nft_id          String?                   // NFT or asset identifier
  nft_name        String?                   // Human-readable name
  wallet          String?                   // Buyer's on-chain wallet address
  metadata        Json?                     // Free-form JSON blob
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt       // Auto-updated by Prisma

  @@index([createdAt])
  @@index([status])
  @@index([wallet])
  @@map("payments")                         // Actual Postgres table name
}
```

#### Status state machine

```
pending ──► success
        └─► failed
        └─► abandoned
```

| Status | Set by | When |
|---|---|---|
| `pending` | `/api/paystack/initiate` | On checkout creation |
| `success` | `/api/paystack/webhook` (charge.success) | Paystack confirms payment |
| `failed` | `/api/paystack/webhook` (charge.failed) | Payment declined |
| `abandoned` | `/api/paystack/verify` poll | Customer closed checkout |

### Other models (unchanged)

| Model | Table | Purpose |
|---|---|---|
| `User` | `users` | Auth.js auth records |
| `Account` | `accounts` | OAuth provider accounts |
| `Session` | `sessions` | Active sessions |
| `KaiUser` | `kai_users` | KAI platform profile |
| `KaiWallet` | `kai_wallets` | On-chain wallets per user |
| `Activity` | `activities` | Audit log of user actions |

---

## Payment Lifecycle

### Step-by-step

```
1.  User enters email + amount on /pay → clicks "Pay via Paystack"

2.  POST /api/paystack/initiate
      body: { email, priceUsd, reference, wallet }
      ↓
      a. upsert Payment(status="pending") into Neon
      b. call Paystack /transaction/initialize
      c. return { authorizationUrl, reference, amountKes }

3.  Frontend opens authorizationUrl in a new browser tab
    User completes payment (card / mobile money / etc.)

4.  Paystack POSTs to /api/paystack/webhook (charge.success)
      ↓
      a. Verify x-paystack-signature HMAC (SHA-512)
      b. updateMany Payment(status="success") in Neon
      c. return 200 (Paystack retries 10x if it doesn't get 200)

5.  Frontend polls GET /api/paystack/verify?reference=<ref>
      ↓
      a. Call Paystack /transaction/verify/<reference>
      b. updateMany Payment(status=<latest>) in Neon
      c. return { status, amountKes, email, paidAt }

6.  UI shows Payment confirmed!
```

### Timing

| Event | Target latency |
|---|---|
| Checkout URL creation | < 2 s |
| Webhook arrival (after payment) | 2–30 s |
| Frontend poll interval | 5 s |
| Frontend poll timeout | 90 s (18 attempts) |

---

## API Routes

### `POST /api/paystack/initiate`

**Request body**
```json
{
  "email":     "user@example.com",
  "priceUsd":  10.50,
  "reference": "KAI-1725138000000-abc12",
  "nftId":     "nft5",
  "nftName":   "10.50 yBOB",
  "wallet":    "0xabc..."
}
```

**Response 201**
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference":        "KAI-1725138000000-abc12",
  "amountKes":        1365,
  "amountKobo":       136500,
  "nftId":            "nft5",
  "nftName":          "10.50 yBOB"
}
```

---

### `GET /api/paystack/verify?reference=<ref>`

**Response 200**
```json
{
  "status":    "success",
  "reference": "KAI-1725138000000-abc12",
  "amountKes": 1365,
  "email":     "user@example.com",
  "paidAt":    "2026-09-01T00:55:00.000Z"
}
```

Possible `status` values: `success` | `failed` | `abandoned` | `pending`

---

### `POST /api/paystack/webhook`

Registered in Paystack Dashboard → Settings → Webhooks.  
URL: `https://<your-domain>/api/paystack/webhook`

**Security:** Every request is verified using HMAC-SHA512 against `PAYSTACK_SECRET_KEY`.
Requests with an invalid signature return `401` and are ignored.

Handled events:

| Event | Action |
|---|---|
| `charge.success` | `status = "success"`, stores receipt metadata |
| `charge.failed`  | `status = "failed"` |

---

## Querying the DB (examples)

### Get all successful payments for a wallet

```ts
import { prisma } from "@/lib/prisma";

const payments = await prisma.payment.findMany({
  where: {
    wallet: "0xabc...",
    status: "success",
  },
  orderBy: { createdAt: "desc" },
});
```

### Get total KES collected today

```ts
const today = new Date();
today.setHours(0, 0, 0, 0);

const result = await prisma.payment.aggregate({
  _sum: { amount_subunits: true },
  where: {
    status:    "success",
    createdAt: { gte: today },
  },
});

const totalKes = Number(result._sum.amount_subunits ?? 0n) / 100;
```

### Check if a reference was already paid

```ts
const payment = await prisma.payment.findUnique({
  where: { reference: "KAI-1725138000000-abc12" },
  select: { status: true },
});

const alreadyPaid = payment?.status === "success";
```

---

## Operational Runbook

### Check DB connection

```bash
cd frontend
npx prisma db execute --stdin <<< "SELECT NOW();"
```

### View payments in Prisma Studio

```bash
cd frontend
npx prisma studio
# Opens http://localhost:5555
```

### Replay a missed webhook

If Paystack's webhook delivery failed, manually verify via API:

```bash
curl "http://localhost:3001/api/paystack/verify?reference=KAI-XXXX"
```

### Reset a stuck `pending` payment

```ts
// Run in a script or via Prisma Studio
await prisma.payment.update({
  where: { reference: "KAI-XXX" },
  data:  { status: "failed" },
});
```

### Register Paystack webhook in dashboard

1. Log in to [dashboard.paystack.com](https://dashboard.paystack.com)
2. **Settings → API Keys & Webhooks**
3. Under **Webhook URL**, add:
   ```
   https://your-production-domain.com/api/paystack/webhook
   ```
4. Enable events: **charge.success**, **charge.failed**

> **Local testing:** Use [ngrok](https://ngrok.com) to expose `localhost:3001`:
> ```bash
> ngrok http 3001
> # Then set webhook to: https://<id>.ngrok-free.app/api/paystack/webhook
> ```

---

## File Map

```
frontend/
├── prisma/
│   └── schema.prisma                         ← DB schema (source of truth)
├── src/
│   ├── lib/
│   │   ├── prisma.ts                         ← Singleton Prisma client
│   │   └── paystack.ts                       ← Paystack API helpers
│   └── app/
│       └── api/
│           └── paystack/
│               ├── initiate/route.ts         ← POST: create checkout + DB record
│               ├── verify/route.ts           ← GET/POST: verify + update DB
│               └── webhook/route.ts          ← POST: Paystack event handler
└── docs/
    └── db-integration.md                     ← This file
```
