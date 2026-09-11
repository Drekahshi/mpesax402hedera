# Product Requirements Document (PRD) & Database Schema
## MSME Intelligent Ledger, Anti-Counterfeit Scan, Cash Flow Tokenization & Chama Yield Optimizer

> **Version:** 1.0.0  
> **Platform:** KAI Nuvari Protocol (Next.js + Neon Postgres + Paystack + Ethereum & Hedera (X402))  
> **Target Audience:** Micro, Small & Medium Enterprises (MSMEs), Merchants, Farmers, and Formal/Informal Savings Groups (Chamas / SACCOs).

---

## 1. Executive Summary & System Architecture

```
                               ┌────────────────────────────────────────────────────────┐
                               │           🤖 KAI Intelligent Business Agent            │
                               │  (Cash Flow AI, Inventory Advice, Credit Scoring)      │
                               └───────────────────────────┬────────────────────────────┘
                                                           │
        ┌──────────────────────────────────────────────────┼──────────────────────────────────────────────────┐
        ▼                                                  ▼                                                  ▼
┌───────────────────────────┐                  ┌───────────────────────────┐                  ┌───────────────────────────┐
│ 📚 MSME Intelligent       │                  │ 🔍 Anti-Counterfeit Scan  │                  │ 🏦 Cash Flow Tokenization │
│    Ledger (Cash Flow)     │                  │    Provenance Engine      │                  │    & Chama Yield Pools    │
└─────────────┬─────────────┘                  └─────────────┬─────────────┘                  └─────────────┬─────────────┘
              │                                              │                                              │
              └──────────────────────────────────────────────┼──────────────────────────────────────────────┘
                                                             ▼
                                             ┌──────────────────────────────┐
                                             │ 🐘 Neon DB + Ethereum & Hedera (X402)│
                                             │    (IPFS + Paystack Rails)   │
                                             └──────────────────────────────┘
```

This system provides a four-pillar infrastructure for African MSMEs and Savings Groups:
1. **Intelligent Ledger:** AI-assisted book-keeping that tracks income, expenses, debts, and predicts cash flow.
2. **Anti-Counterfeit Product Scanner:** QR/NFC cryptographic product authenticity verification (for seeds, fertilizers, medicines, goods).
3. **Cash Flow Tokenization (RWA):** Turning accounts receivable / future invoices into tokenized assets to get instant working capital loans.
4. **Chama & Savings Group Yield Optimizer:** Group pool management that automatically routes unallocated savings into highest-yield DeFi vaults (e.g. 18% APY on yBOB / KES).

---

## 2. Complete Database Schema (Prisma ORM)

File: `prisma/schema.prisma`

```prisma
// ============================================================================
// 1. MSME BUSINESS PROFILES & CASH FLOW ENGINE
// ============================================================================
model MsmeBusiness {
  id                   String            @id @default(cuid())
  businessName         String            // e.g. "Kipkelion Farm Supplies & Hardware"
  ownerName            String
  phoneNumber          String            @unique // M-Pesa / Paystack settlement
  walletAddress        String?           // Ethereum & Hedera wallet for tokenized invoices
  category             BusinessCategory  @default(AGRI_SUPPLIES)
  location             String
  cashFlowScore        Float             @default(50.0) // AI-calculated credit score (0-100)
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt

  ledgerEntries        LedgerEntry[]
  verifiedProducts     ProductProvenance[]
  cashFlowTokens       CashFlowToken[]

  @@map("msme_businesses")
}

enum BusinessCategory {
  AGRI_SUPPLIES
  RETAIL_SHOP
  HARDWARE
  PHARMACEUTICAL
  TEXTILE_CRAFTS
  PRODUCE_DISTRIBUTOR
}

// ============================================================================
// 2. INTELLIGENT DOUBLE-ENTRY LEDGER
// ============================================================================
model LedgerEntry {
  id               String        @id @default(cuid())
  businessId       String
  type             EntryType     // INCOME | EXPENSE | CREDIT_GIVEN | DEBT_OWED
  amountKes        Float
  counterpartyName String?       // Customer or Supplier name
  description      String        // e.g. "Sold 10 bags of DAP Fertilizer"
  categoryTag      String        // "Inventory", "Rent", "Sales", "Utilities"
  paymentMethod    String        @default("CASH") // CASH | MPESA | PAYSTACK | YBOB
  receiptIpfsHash  String?       // Photo proof of receipt/invoice on IPFS
  aiAdvice         String?       // AI Agent feedback on this expense/sale
  timestamp        DateTime      @default(now())

  business         MsmeBusiness  @relation(fields: [businessId], references: [id])

  @@index([businessId])
  @@index([type])
  @@map("ledger_entries")
}

enum EntryType {
  INCOME
  EXPENSE
  CREDIT_GIVEN   // Money customers owe the MSME
  DEBT_OWED      // Money the MSME owes suppliers
}

// ============================================================================
// 3. ANTI-COUNTERFEIT PRODUCT VERIFICATION
// ============================================================================
model ProductProvenance {
  id                 String              @id @default(cuid())
  serialNumber       String              @unique // Unique QR code payload / NFC UID
  batchNumber        String
  productName        String              // e.g. "Certified Certified Maize Hybrid 6213"
  manufacturerName   String              // e.g. "Kenya Seed Company"
  manufacturerDid    String              // Manufacturer Decentralized ID
  manufacturingDate  DateTime
  expiryDate         DateTime?
  manufactureCountry String              @default("Kenya")
  
  // Verification Attributes
  isGenuine          Boolean             @default(true)
  securityHash       String              // SHA-256 hash of manufacturer signature
  scansCount         Int                 @default(0)
  
  businessId         String?             // MSME distributor holding inventory
  scans              ProductScanLog[]

  business           MsmeBusiness?       @relation(fields: [businessId], references: [id])
  createdAt          DateTime            @default(now())

  @@index([serialNumber])
  @@map("product_provenance")
}

model ProductScanLog {
  id                String            @id @default(cuid())
  productScanId     String
  scannedByPhone    String?           // Consumer / Inspector phone
  gpsLatitude       Float?
  gpsLongitude      Float?
  isAuthentic       Boolean
  scanResultMsg     String            // "✅ Authentic Certified Product" or "⚠️ Warning: Duplicate Scan Detected"
  scannedAt         DateTime          @default(now())

  product           ProductProvenance @relation(fields: [productScanId], references: [id])

  @@map("product_scan_logs")
}

// ============================================================================
// 4. CASH FLOW TOKENIZATION (RWA INVOICE FINANCING)
// ============================================================================
model CashFlowToken {
  id                String            @id @default(cuid())
  tokenRef          String            @unique // e.g. "RWA-INV-2026-0041"
  businessId        String
  invoiceAmountKes  Float             // Invoice face value e.g. KES 100,000
  discountPriceKes  Float             // Price investors pay e.g. KES 92,000 (8% APR yield)
  maturityDate      DateTime          // Date invoice customer must pay
  debtorName        String            // Supermarket/Company owing invoice
  status            TokenizedStatus   @default(DRAFT)
  nftTokenId        String?           // On-chain Ethereum & Hedera RWA Token ID
  fundedByInvestor  String?           // Investor wallet address

  business          MsmeBusiness      @relation(fields: [businessId], references: [id])
  createdAt         DateTime          @default(now())

  @@map("cash_flow_tokens")
}

enum TokenizedStatus {
  DRAFT
  LISTED_FOR_FUNDING
  FUNDED
  SETTLED_PAID
  DEFAULTED
}

// ============================================================================
// 5. CHAMA & SAVINGS GROUP YIELD OPTIMIZER
// ============================================================================
model ChamaGroup {
  id                  String             @id @default(cuid())
  groupName           String             // e.g. "Mwanzo Mpya Women Savings Chama"
  registrationNumber  String?            // Official Social Services Reg No
  cyclePeriodDays     Int                @default(30) // Monthly round
  contributionAmount  Float              // Per member contribution per round
  totalPoolBalanceKes Float              @default(0)
  yieldAllocatedKes   Float              @default(0) // Extra yield earned from DeFi
  activeVaultStrategy VaultStrategyType  @default(BALANCED_YBOB_VAULT)
  groupWallet         String?            // On-chain group multisig wallet
  createdAt           DateTime           @default(now())

  members             ChamaMember[]
  contributions       ChamaContribution[]
  yieldYieldLogs      ChamaYieldLog[]

  @@map("chama_groups")
}

enum VaultStrategyType {
  CONSERVATIVE_KES_STABLE // 12% APY KES vault
  BALANCED_YBOB_VAULT     // 18% APY yBOB yield pool
  HIGH_YIELD_ETH_POOL    // 24% APY Ethereum & Hedera liquidity pool
}

model ChamaMember {
  id               String            @id @default(cuid())
  chamaId          String
  memberName       String
  phoneNumber      String
  role             ChamaRole         @default(MEMBER)
  totalContributed Float             @default(0)
  sharePercentage  Float             @default(0)
  
  chama            ChamaGroup        @relation(fields: [chamaId], references: [id])
  contributions    ChamaContribution[]

  @@map("chama_members")
}

enum ChamaRole {
  CHAIRPERSON
  TREASURER
  SECRETARY
  MEMBER
}

model ChamaContribution {
  id               String            @id @default(cuid())
  chamaId          String
  memberId         String
  amountKes        Float
  paymentRef       String            // Paystack / M-Pesa reference
  status           PaymentStatus     @default(SUCCESS)
  timestamp        DateTime          @default(now())

  chama            ChamaGroup        @relation(fields: [chamaId], references: [id])
  member           ChamaMember       @relation(fields: [memberId], references: [id])

  @@map("chama_contributions")
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
}

model ChamaYieldLog {
  id               String            @id @default(cuid())
  chamaId          String
  amountInvested   Float             // Principal routed to vault
  yieldEarnedKes   Float             // Returns generated
  strategyUsed     VaultStrategyType
  txHash           String?           // Ethereum & Hedera transaction hash
  generatedAt      DateTime          @default(now())

  chama            ChamaGroup        @relation(fields: [chamaId], references: [id])

  @@map("chama_yield_logs")
}
```

---

## 3. Anti-Counterfeit Verification Workflow

```
Consumer Scans QR/NFC ──► GET /api/verify/scan?serial=XYZ ──► Decrypt Manufacturer Signature
                                                                       │
                         ┌─────────────────────────────────────────────┴─────────────────────────────────────────────┐
                         ▼                                                                                           ▼
            ✅ Authentic Product Match                                                                   ⚠️ Counterfeit Alert!
     "Kenya Seed Co. Batch #8812 - Genuine"                                                    "Warning: Code scanned 42 times! Report fraud."
```

### API Endpoint: `POST /api/verify/scan`

```ts
// src/app/api/verify/scan/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { serialNumber, userPhone, gpsLat, gpsLong } = await req.json();

  const product = await prisma.productProvenance.findUnique({
    where: { serialNumber },
  });

  if (!product) {
    return NextResponse.json({
      authentic: false,
      message: "⚠️ Warning: Serial number not registered in authentic database!",
    }, { status: 404 });
  }

  // Increment scan counter
  const isDuplicateScan = product.scansCount > 0;
  
  await prisma.productProvenance.update({
    where: { serialNumber },
    data: { scansCount: { increment: 1 } },
  });

  await prisma.productScanLog.create({
    data: {
      productScanId: product.id,
      scannedByPhone: userPhone,
      gpsLatitude: gpsLat,
      gpsLongitude: gpsLong,
      isAuthentic: !isDuplicateScan,
      scanResultMsg: isDuplicateScan 
        ? `⚠️ Warning: Previously scanned ${product.scansCount} times!`
        : "✅ Authentic Verified Product",
    },
  });

  return NextResponse.json({
    authentic: !isDuplicateScan,
    productName: product.productName,
    manufacturer: product.manufacturerName,
    batchNumber: product.batchNumber,
    scansCount: product.scansCount + 1,
    message: isDuplicateScan
      ? `⚠️ Counterfeit Risk: Code already scanned ${product.scansCount} times.`
      : "✅ Genuine Certified Product",
  });
}
```

---

## 4. Cash Flow Tokenization (RWA Receivables)

When an MSME supplies goods to a large buyer (e.g. KES 100,000 due in 60 days), they can **tokenize the cash flow**:

1. **Upload Invoice:** MSME creates a `LedgerEntry` and uploads the signed invoice.
2. **Tokenize:** System creates a `CashFlowToken` offering the invoice at a discount (e.g., KES 92,000 upfront cash vs KES 100,000 face value).
3. **Investor Fund:** Impact investors or Chama yield pools fund the KES 92,000 via Paystack.
4. **Maturity Repayment:** When the buyer pays the 100,000 KES invoice, the MSME settles the token, giving investors an 8.6% yield (equivalent to 52% APR).

---

## 5. Chama Yield Optimization Engine

Chamas collect monthly member contributions that often sit idle in bank accounts. The **Yield Optimizer** automatically routes unallocated cash into **Nuvari Vaults**:

```
Monthly Member Contributions (M-Pesa / Paystack)
                    │
                    ▼
     Chama Group Pool Treasury (Neon DB)
                    │
                    ▼
     Auto-Routed to Nuvari Vault Strategy
  (60% yBOB 18% APY Vault + 40% KES Stable Vault)
                    │
                    ▼
     Monthly Interest Paid Back to Chama Members
```

### Sample Payout Distribution Query:
```ts
// Calculate per-member yield distribution
const chama = await prisma.chamaGroup.findUnique({
  where: { id: "chama_123" },
  include: { members: true },
});

const totalYieldKes = chama?.yieldAllocatedKes || 0;

const payouts = chama?.members.map(m => ({
  memberName: m.memberName,
  phoneNumber: m.phoneNumber,
  shareAmountKes: (m.sharePercentage / 100) * totalYieldKes,
}));
```

---

## 6. Next Steps

1. Save schema additions to `prisma/schema.prisma` and push (`npx prisma db push`).
2. Build the **Anti-Counterfeit QR Code Scanner UI** (`src/app/scan/page.tsx`).
3. Build the **MSME Cash Flow & Ledger Dashboard** (`src/app/msme/page.tsx`).
4. Build the **Chama Savings Pool & Yield Routing Interface** (`src/app/chama/page.tsx`).
