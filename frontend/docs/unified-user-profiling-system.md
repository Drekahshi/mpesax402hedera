# KAI Protocol — Unified Single-Profile Architecture
## 3-in-1 Adaptive Persona Engine & Informality Intelligence

> **Version:** 1.0.0  
> **Core Concept:** A single user in emerging market communities wears **3 hats simultaneously** (Forest Guardian, MSME Merchant, and Chama Saver). Rather than forcing users into separate apps, KAI unifies them into **one identity** with a dynamic, context-aware interface.

---

## 1. Executive Summary & The "3 Hats" Vision

```
                        ┌────────────────────────────────────────────────────────┐
                        │              👤 Unified Community User Profile         │
                        │       (Single Phone Number + W3C DID + Wallet Address) │
                        └───────────────────────────┬────────────────────────────┘
                                                    │
        ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
        ▼                                           ▼                                           ▼
  🌲 Hat 1: Forest Guardian                   🏬 Hat 2: MSME Merchant                    🤝 Hat 3: Chama Saver
  • Seedling Nursery Inventory               • Cash Flow Ledger                         • Group Dues & Pool Payouts
  • Geotagged Planting & Proof               • QR Anti-Counterfeit Scan                 • DeFi Yield Optimizer (18%)
  • Carbon Survival Bounties                 • Invoice Tokenization                     • Peer-to-Peer Micro Loans
```

### Why Unification Matters:
1. **Zero Fragmented Identities:** A farmer who pots seedlings in the morning, sells fertilizer at their shop in the afternoon, and attends a Chama meeting at night has **one financial footprint**.
2. **Composite Credit Scoring:** A user's Chama repayment history + tree survival rate + shop cash flow merge into a single **KAI Trust Score**, granting higher micro-loan limits and lower interest rates.
3. **Adaptive Informality UI:** The interface shifts terminology and tools automatically based on the user's current task and informal language preference (Sheng, Swahili, English, Dialect).

---

## 2. Unified Schema Architecture (Prisma ORM)

File: `prisma/schema.prisma`

```prisma
// ============================================================================
// 1. UNIFIED USER PROFILE (ONE USER = THREE HATS)
// ============================================================================
model UnifiedUserProfile {
  id                    String             @id @default(cuid())
  phoneNumber           String             @unique // Primary identifier (M-Pesa / Paystack)
  did                   String             @unique // W3C Decentralized ID
  fullName              String
  walletAddress         String?            // Single Ethereum & Hedera (X402) Wallet
  primaryLanguage       LanguagePreference @default(SWAHILI)
  informalityScore      Float              @default(50.0) // 0 (Formal Business) to 100 (Fully Informal)
  currentActiveHat      UserRoleHat        @default(FOREST_GUARDIAN)
  
  // Composite Credit & Reputation Metrics
  combinedTrustScore    Float              @default(60.0) // Unified KAI Credit Score (300-850)
  forestSurvivalScore   Float              @default(0.0)  // Score from Hat 1 (0-100%)
  msmeCashFlowScore     Float              @default(0.0)  // Score from Hat 2 (0-100%)
  chamaRepaymentScore   Float              @default(0.0)  // Score from Hat 3 (0-100%)

  // Connected Persona Profiles
  nurseryGroupMember    TreePlanter?
  msmeBusiness          MsmeBusiness?
  chamaMemberships      ChamaMember[]
  activities            UnifiedActivityLedger[]

  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@map("unified_user_profiles")
}

enum UserRoleHat {
  FOREST_GUARDIAN     // Hat 1: Nursery, Planting, MRV
  MSME_MERCHANT       // Hat 2: Ledger, Anti-Counterfeit, Invoice Financing
  CHAMA_SAVER         // Hat 3: Group Savings, Yield Pools, Micro-loans
}

enum LanguagePreference {
  ENGLISH
  SWAHILI
  SHENG
  LOCAL_DIALECT
}

// ============================================================================
// 2. UNIFIED ACTIVITY & REPUTATION LEDGER
// ============================================================================
model UnifiedActivityLedger {
  id                   String             @id @default(cuid())
  userId               String
  activeHat            UserRoleHat
  actionTitle          String             // e.g. "Planted 20 Bamboo Trees", "Recorded 5,000 KES Sales", "Paid Monthly Chama Dues"
  amountKes            Float              @default(0)
  trustScoreImpact     Float              @default(0) // +Points added to KAI Trust Score
  metadata             Json?              // Contextual payload
  timestamp            DateTime           @default(now())

  user                 UnifiedUserProfile @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([activeHat])
  @@map("unified_activity_ledger")
}
```

---

## 3. The Composite KAI Trust Score Engine

The user's creditworthiness and eligibility for low-interest working capital loans is calculated by combining all three hats:

$$\text{Unified KAI Trust Score} = (0.45 \times \text{Chama Repayment}) + (0.35 \times \text{MSME Cash Flow}) + (0.20 \times \text{Forest Tree Survival})$$

```
                   ┌─────────────────────────────────────────┐
                   │    🌲 Tree Survival Rate (20% Weight)   │
                   ├─────────────────────────────────────────┤
                   │    🏬 MSME Cash Flow Score (35% Weight) │
                   ├─────────────────────────────────────────┤
                   │    🤝 Chama Repayment Score (45% Weight)│
                   └────────────────────┬────────────────────┘
                                        │
                                        ▼
                   ┌─────────────────────────────────────────┐
                   │     🏆 UNIFIED KAI TRUST SCORE          │
                   │    Unlocks Low-Interest Micro-Loans     │
                   └─────────────────────────────────────────┘
```

| Score Range | Trust Tier | Unlocked Platform Privileges |
|---|---|---|
| **750 - 850** | 🌟 Platinum Guardian | Zero-collateral invoice financing, priority seed allocation, 2% loan interest rate |
| **650 - 749** | 🟢 Gold Member | 80% LTV invoice tokenization, instant Chama pool yield withdrawals |
| **550 - 649** | 🟡 Silver Member | Standard nursery bounties, Paystack 1-click payouts |
| **< 550** | 🟠 Bronze / New | Mandatory 6-month tree survival verification before loan access |

---

## 4. Contextual Adaptive UI Switcher (Next.js Component)

The frontend automatically presents the tools the user needs based on their selected **Hat**, while keeping their wallet and profile synchronized:

```tsx
// src/components/UnifiedHatSwitcher.tsx
'use client';

import { useState } from 'react';
import { Trees, Store, Users, ShieldCheck } from 'lucide-react';

type Hat = 'FOREST_GUARDIAN' | 'MSME_MERCHANT' | 'CHAMA_SAVER';

interface HatSwitcherProps {
  userProfile: {
    name: string;
    trustScore: number;
    walletAddress: string;
  };
  onHatChange: (hat: Hat) => void;
}

export default function UnifiedHatSwitcher({ userProfile, onHatChange }: HatSwitcherProps) {
  const [activeHat, setActiveHat] = useState<Hat>('FOREST_GUARDIAN');

  const handleSwitch = (hat: Hat) => {
    setActiveHat(hat);
    onHatChange(hat);
  };

  return (
    <div className="w-full bg-[#121218] border border-white/10 rounded-2xl p-4 text-white">
      {/* Profile Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div>
          <h3 className="font-bold text-sm text-white">{userProfile.name}</h3>
          <p className="text-xs text-white/50 font-mono">
            {userProfile.walletAddress.slice(0, 6)}...{userProfile.walletAddress.slice(-4)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-gold-base/15 border border-gold-base/30 px-3 py-1 rounded-full text-gold-base text-xs font-bold font-mono">
          <ShieldCheck size={14} />
          <span>Trust Score: {userProfile.trustScore}</span>
        </div>
      </div>

      {/* 3-Hat Switcher Buttons */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <button
          onClick={() => handleSwitch('FOREST_GUARDIAN')}
          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-bold transition-all ${
            activeHat === 'FOREST_GUARDIAN'
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
          }`}
        >
          <Trees size={18} />
          <span>🌲 Guardian</span>
        </button>

        <button
          onClick={() => handleSwitch('MSME_MERCHANT')}
          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-bold transition-all ${
            activeHat === 'MSME_MERCHANT'
              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
          }`}
        >
          <Store size={18} />
          <span>🏬 Merchant</span>
        </button>

        <button
          onClick={() => handleSwitch('CHAMA_SAVER')}
          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-bold transition-all ${
            activeHat === 'CHAMA_SAVER'
              ? 'bg-purple-500/20 border-purple-500 text-purple-400'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
          }`}
        >
          <Users size={18} />
          <span>🤝 Chama</span>
        </button>
      </div>
    </div>
  );
}
```

---

## 5. Next Steps

1. Save `UnifiedUserProfile` to `prisma/schema.prisma` and execute `npx prisma db push`.
2. Integrate `UnifiedHatSwitcher` into the main app header/sidebar.
3. Wire up the **AI Agent Intent Classifier** (`ai-agent/server.py`) so when a user says:
   - *"I want to check my nursery"* → Agent activates **Guardian Mode**.
   - *"Scan this seed packet"* → Agent activates **Merchant Counterfeit Mode**.
   - *"Pay my monthly dues"* → Agent activates **Chama Mode**.
