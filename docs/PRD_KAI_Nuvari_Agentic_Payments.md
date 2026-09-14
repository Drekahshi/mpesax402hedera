# PRD — KAI Nuvari Agentic Payments
### Hedera X402 + DID + M-Pesa + Busha

**Product:** KAI Nuvari  
**Platform:** Next.js 16 + TypeScript  
**Primary Blockchain:** Hedera  
**Primary Payment Protocol:** X402  
**Secondary Payment Rails:** M-Pesa (Kenya), Busha (Nigeria)  
**Primary Use Case:** Purchasing Conservation NFTs  
**Agent Interface:** Voice + Chat  

---

## 1. Problem Statement

Buying a conservation NFT today means a non-crypto-native user has to hold a wallet, understand gas, and manually approve every single transaction. That friction kills conversion for the exact audience KAI Nuvari is trying to reach — people who care about conservation outcomes but aren't Web3-fluent, and users in Kenya/Nigeria who are far more comfortable paying with mobile money than with a browser wallet extension.

This project builds an AI payment agent that lets a user say (by voice or chat) *"Buy me Conservation NFT #24"*, and have the agent handle intent understanding, authorization checks, and payment execution — without ever giving the AI direct control of funds, and without forcing a wallet-approval popup on every purchase once the user has opted into a bounded spending policy.

**Key Architecture Framing:**
- **Hedera X402**: Core payment rail.
- **DID**: Identity & authorization layer — decides *what the agent is allowed to do*, not how payment moves.
- **M-Pesa & Busha**: Alternative NFT-purchase payment rails for users paying via mobile money / local fiat gateways instead of direct HBAR.

---

## 2. Goals & Success Criteria

**Goal:** Ship a working demo where a user can purchase a conservation NFT via voice/chat using Hedera X402 as the primary rail, with M-Pesa and Busha as fallback rails, and where a one-time bounded authorization removes the need for repeated wallet approvals.

### Success Metrics:
1. **Zero-Setup Purchase:** A user completes an end-to-end NFT purchase via X402 with manual approval mode (baseline).
2. **Auto-Pay Purchase:** A user enables X402 Auto-Pay once and completes subsequent purchases within policy limits with zero additional approval prompts.
3. **Independent Settlement Verification:** A payment is never marked "paid" and an NFT is never transferred without backend verification (never trust client-side claims).
4. **Alternative Rails:** M-Pesa (Daraja) and Busha purchases execute end-to-end for test transactions using async callbacks/webhooks as the single source of truth.
5. **Demo Speed:** Full loop (`Agent Intent` → `Authorization` → `Payment` → `Verified Settlement` → `NFT Transfer` → `Hedera Audit Record`) demoable in under 3 minutes.

---

## 3. Out of Scope (MVP)

To keep MVP execution fast and focused:
- ❌ Secondary NFT marketplace or resale mechanics
- ❌ Multi-currency wallet balance display or complex portfolio management
- ❌ Payment rails beyond X402, M-Pesa, and Busha
- ❌ General-purpose arbitrary transfers (strictly scoped to Conservation NFT purchases)
- ❌ Full KYC/AML compliance pipelines (mock/sandbox credentials used for MVP)
- ❌ Fully generalized DID registry (implement only the lightweight policy verification needed)

---

## 4. Core Architecture

> **Security Invariant:** The system must **never** let the AI model directly hold or control private keys.

```
                    USER
                      │
                 Voice / Chat
                      │
                      ▼
              ┌──────────────┐
              │  AI AGENT    │
              │ Intent + RAG │
              └──────┬───────┘
                     │
                     ▼
             ┌─────────────────┐
             │ Payment Intent   │
             │ + Policy Engine  │
             └────────┬────────┘
                      │
             ┌────────┴─────────┐
             │                  │
             ▼                  ▼
        DID / Policy       Payment Router
        Authorization            │
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
          Hedera X402          M-Pesa            Busha
          (PRIMARY)           (Kenya)          (Nigeria)
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 ▼
                       Payment Verification
                                 │
                                 ▼
                         NFT Purchase Engine
                                 │
                                 ▼
                         Hedera NFT Transfer
                                 │
                                 ▼
                         Hedera Audit Trail (HCS)
```

---

## 5. Agent Responsibilities

The AI agent does not execute blockchain transactions directly. It parses natural language into structured intents:

```json
{
  "action": "PURCHASE_NFT",
  "nftId": "CONSERVATION-024",
  "amount": "10",
  "currency": "HBAR",
  "preferredRail": "HEDERA_X402"
}
```

### Conversational Flow:
1. User: *"Buy me Conservation NFT #024."*
2. Agent: *"I found Conservation NFT #024. It costs 10 HBAR. Would you like me to purchase it?"*
3. Backend checks policy & authorization.
4. Payment router executes and settles.
5. Agent confirms transfer status.

---

## 6. DID & Identity Layer

**Purpose:** Identifies the agent/user and establishes verifiable authority.

```
DID → Who is this agent? → What authority has been granted?
    → What actions can it perform? → Payment Policy → X402 execution
```

- **Format:** `did:hedera:<network>:<identifier>`
- **Interface abstraction:**
```typescript
export interface AgentIdentity {
  did: string;
  verify(): Promise<boolean>;
}
```

---

## 7. Bounded Authorization & X402 Auto-Pay

Users can opt into bounded auto-pay rules rather than confirming every micro-transaction:

```
┌───────────────────────────────────────────┐
│              X402 AUTO-PAY                │
├───────────────────────────────────────────┤
│ Maximum per NFT:       10 HBAR            │
│ Daily spending limit:  50 HBAR            │
│ Allowed action:        Conservation NFTs  │
│ Allowed network:       Hedera             │
│ Expiry:                30 days            │
├───────────────────────────────────────────┤
│             [Enable Auto-Pay]             │
└───────────────────────────────────────────┘
```

### Policy Schema:
```json
{
  "agentDid": "did:hedera:testnet:0.0.12345",
  "action": "PURCHASE_CONSERVATION_NFT",
  "network": "hedera",
  "maxPerTransaction": "10 HBAR",
  "dailyLimit": "50 HBAR",
  "expiresAt": "2026-10-14T00:00:00Z"
}
```

### Security Safeguards:
- 🚫 Cannot transfer funds to arbitrary accounts
- 🚫 Cannot alter spending limits without explicit user signature
- 🚫 Cannot withdraw or drain user balances
- 🚫 Cannot purchase unapproved asset categories
- 🚫 Cannot exceed transaction/daily budget limits or operate past expiry

---

## 8. Hedera X402 Primary Flow

```
User: "Buy me the Oloolua Conservation NFT #24."
 1. Agent parses intent → PURCHASE_NFT, id: #24
 2. Backend gets metadata → Price: 10 HBAR, Network: Hedera, Status: Available
 3. Policy check → Is Auto-Pay enabled & within limits? (10 HBAR <= 10 HBAR max) → AUTHORIZED
 4. X402 Challenge/Response → Server returns HTTP 402 with payment specs; client constructs payment authorization
 5. Hedera Settlement → Payment submitted to Hedera network
 6. Backend Verification → Query Hedera Mirror Node / Consensus to verify settlement
 7. NFT Transfer → Payment verified → Mint / Transfer HTS NFT to user
 8. Agent Response → "Done. Conservation NFT #24 has been purchased and transferred to your wallet."
```

---

## 9. Manual vs Auto-Pay Modes

### Manual Approval Mode:
```
User → "Buy NFT" → Server emits 402 → UI displays Approval Modal → User signs → X402 Settle → Verify → NFT Transfer
```

### Auto-Pay Mode:
```
User → "Buy NFT #24" → Agent → Policy Engine verifies bounds → X402 executes delegated payment → Hedera Settle → Verify → NFT Transfer (No UI popup)
```

---

## 10. Secondary Rails: M-Pesa & Busha

### Common Payment Rail Interface:
```typescript
export interface PaymentRail {
  createPayment(intent: PaymentIntent): Promise<PaymentRequest>;
  verifyPayment(paymentId: string): Promise<PaymentStatus>;
}
```

### M-Pesa Flow (Kenya):
1. User selects NFT → Chooses M-Pesa (or defaults from phone intent).
2. Backend triggers Daraja STK Push to user's Safaricom number.
3. User enters M-Pesa PIN on handset.
4. Daraja webhook/callback notifies backend.
5. Backend verifies transaction ID with Safaricom.
6. NFT engine transfers HTS NFT to user's Hedera address.

### Busha Flow (Nigeria):
1. User selects NFT → Chooses Busha (NGN/crypto ramp).
2. Busha checkout intent generated.
3. Payment completed via Busha checkout.
4. Busha webhook triggers verification on backend.
5. Backend completes HTS NFT transfer.

---

## 11. Payment Router

```typescript
export class PaymentRouter {
  async execute(intent: PaymentIntent): Promise<TransactionResult> {
    switch (intent.rail) {
      case "HEDERA_X402":
        return this.hederaX402.execute(intent);
      case "MPESA":
        return this.mpesa.execute(intent);
      case "BUSHA":
        return this.busha.execute(intent);
      default:
        throw new Error(`Unsupported payment rail: ${intent.rail}`);
    }
  }
}
```

---

## 12. Unified Data Models

### Payment Intent:
```typescript
export type PaymentIntent = {
  id: string;
  userId: string;
  agentDid?: string;
  purpose: "NFT_PURCHASE";
  nftId: string;
  amount: string;
  currency: "HBAR" | "KES" | "NGN";
  rail: "HEDERA_X402" | "MPESA" | "BUSHA";
  status:
    | "CREATED"
    | "AWAITING_APPROVAL"
    | "PROCESSING"
    | "PAID"
    | "FAILED"
    | "EXPIRED";
  createdAt: string;
};
```

### NFT Purchase State Machine:
```
CREATED
   ↓
PAYMENT_REQUIRED
   ↓
AWAITING_APPROVAL
   ↓
PAYMENT_PROCESSING
   ↓
PAYMENT_VERIFIED
   ↓
NFT_TRANSFER_PENDING
   ↓
NFT_TRANSFERRED
   ↓
COMPLETED
```
*Failure paths:* `PAYMENT_FAILED`, `PAYMENT_EXPIRED`, `NFT_TRANSFER_FAILED`

---

## 13. Hedera Token Standard (HTS) & Audit Trail

- **Token Standard:** Hedera Token Service (HTS) Non-Fungible Tokens.
- **Royalties:** `CustomRoyaltyFee` (for conservation project revenue splits).
- **Metadata Schema:**
  - `nftId`: Unique NFT identifier (e.g. `CONSERVATION-024`)
  - `projectName`: Conservation sanctuary / project (e.g. `Oloolua Forest Conservation`)
  - `priceHbar`: Fixed base price in HBAR
  - `impactData`: Verified impact metrics (hectares protected, tree count, carbon offset)
  - `mediaUrl`: IPFS/CDN asset URL
- **Audit Logging (HCS):** Hedera Consensus Service topic records timestamped agent actions, policy approvals, and settlement IDs for transparency.

---

## 14. Recommended Codebase Structure

```
/frontend (or /app)
  /src/app
    /api
      /agent/route.ts
      /payments
        /x402/route.ts
        /mpesa/route.ts
        /busha/route.ts
      /nfts/route.ts
      /webhooks
        /mpesa/route.ts
        /busha/route.ts
    /chat/page.tsx
    /marketplace/page.tsx

  /src/lib
    /agent
      intent.ts
      executor.ts
      rag.ts
      tools.ts

    /identity
      did.ts

    /authorization
      policy.ts
      policy-engine.ts

    /payments
      payment-router.ts
      payment-intent.ts
      types.ts
      /x402/
        client.ts
        settlement.ts
        verifier.ts
      /mpesa/
        daraja.ts
        stk.ts
        callback.ts
      /busha/
        client.ts
        webhook.ts

    /nft
      purchase.ts
      transfer.ts
      hts.ts
```

---

## 15. Implementation Plan & Milestones

| Phase | Milestone | Focus Areas |
|---|---|---|
| **Phase 1 (Core)** | **Hedera X402 NFT Purchase** | NFT catalog, HTTP 402 protocol handler, HBAR settlement, Mirror Node verifier, HTS transfer |
| **Phase 2 (UX)** | **Voice & Chat Agent** | Intent parser, RAG knowledge store, tool calling (`getNFT`, `createIntent`, `checkAuth`, `executePayment`) |
| **Phase 3 (Security)** | **DID + Policy Engine** | Agent DID schema, user bounded spending policy, auto-pay validation |
| **Phase 4 (Expansion)** | **M-Pesa Rail (Kenya)** | Safaricom Daraja STK push integration & callback verification |
| **Phase 5 (Expansion)** | **Busha Rail (Nigeria)** | Busha checkout integration & webhook verification |

> **Development Rule:** Build and test Phase 1 (`Hedera X402` → `Verified Settlement` → `HTS Transfer`) end-to-end first before layering on the agent/DID policies.

---

## 16. 3-Minute Demo Script

1. **Explore:** User opens KAI Nuvari and asks: *"Show me the conservation NFTs."* (Agent renders carousel with metadata and HBAR pricing).
2. **First Buy (Manual):** User says: *"Buy NFT 24."* Agent checks policy → Auto-Pay not yet enabled → prompts for approval.
3. **Opt-In Auto-Pay:** User clicks **Enable X402 Auto-Pay** (Max per item: 10 HBAR, Daily limit: 50 HBAR).
4. **Second Buy (Agentic):** User says: *"Buy NFT 25."* → Agent verifies intent against policy → executes X402 in background → displays verified settlement & NFT receipt with **zero popups**.
5. **Alternative Rail (M-Pesa):** User says: *"Buy NFT 26 with M-Pesa"* → STK push triggers on phone → PIN entered → callback confirms → NFT transferred.
