# KAI Embedded Wallet & Web3 Auth Architecture — Technical PRD & Developer Specification

**Version:** 1.0  
**Target Network:** Ethereum & Hedera (X402) (Mainnet: `1` / Sepolia Testnet: `11155111`)  
**Authentication & Embedded Wallet Layer:** Privy (`@privy-io/react-auth`, `@privy-io/wagmi`)  
**Operational Storage:** PostgreSQL (Neon DB) + IPFS Evidence Bucket  
**Primary Audience:** Full-Stack Engineers, Smart Contract Developers, Product Leads  

---

## 1. Executive Summary & Core Philosophy

The primary friction in Web3 applications—especially for non-crypto native users such as Community Forest Association (CFA) members, nursery managers, and local MSME owners—is complex wallet setup, seed phrase management, network switching, and gas fees.

KAI eliminates this friction by positioning **Privy** as an invisible Web2-like onboarding layer with **embedded Ethereum & Hedera (X402) EVM wallets**.

```
                                  SYSTEM LAYER STACK
                                  

 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │ 🌐 KAI FRONTEND DAPP (Next.js 16 + React 19 + Wagmi v3)                                │
 └───────────────────────────┬──────────────────────────────────────────┬─────────────────┘
                             │                                          │
                             ▼                                          ▼
 ┌────────────────────────────────────────┐               ┌───────────────────────────────┐
 │ 🔐 PRIVY AUTHENTICATION & EMBEDDED WALLET│               │ 🤖 KAI INTELLIGENCE AGENT     │
 │    (Google / Phone / Email Login)      │               │    (RAG, Natural Queries)     │
 └───────────────────────────┬────────────┘               └─────────────┬─────────────────┘
                             │                                          │
                             ▼                                          ▼
 ┌────────────────────────────────────────┐               ┌───────────────────────────────┐
 │ 🐘 POSTGRESQL (Neon DB)                │               │ 🔺 ETHEREUM & HEDERA (X402)          │
 │    Operational Data & Relational State │               │    On-Chain Settlement &      │
 │    (Users, CFAs, Nurseries, Trees)     │               │    Cryptographic Proof Engine │
 └────────────────────────────────────────┘               └───────────────────────────────┘
```

### Core UX Principle: "Account First, Blockchain Underneath"
- Users log in via **Google, SMS, or Email**.
- Privy transparently creates an **Ethereum & Hedera-compatible EVM wallet (`0x...`)** in the background.
- Users never have to manually manage seed phrases or configure RPC parameters.

---

## 2. Dual Identity Architecture (Database vs Wallet)

To ensure identity stability, KAI strictly separates **Application Identity (`user_id`)** from **Blockchain Identity (`wallet_address`)**.

> [!IMPORTANT]
> **Never use a wallet address as the primary database key.** Users may link secondary wallets, change embedded wallet provider delegates, or use hardware wallets for investor transactions.

### 2.1 Database Identity Schema (`users` & `wallets`)

```sql
-- Application User Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    privy_user_id VARCHAR(255) UNIQUE NOT NULL, -- e.g. "did:privy:clx12345..."
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'USER', -- USER, CFA_MEMBER, CFA_ADMIN, NURSERY_MANAGER, VALIDATOR, SME, INVESTOR
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Linked Wallet Addresses Table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(128) NOT NULL UNIQUE,
    wallet_client_type VARCHAR(50) DEFAULT 'PRIVY_EMBEDDED', -- PRIVY_EMBEDDED, METAMASK, CORE_WALLET, COINBASE
    chain VARCHAR(50) DEFAULT 'ETHEREUM',
    network_id INT DEFAULT 11155111, -- 11155111 (Sepolia), 1 (Mainnet)
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Off-Chain Operational Database vs On-Chain Ethereum & Hedera Settlement

```
                               DATA DISTRIBUTION MODEL
                               

         POSTGRESQL OPERATIONAL STORAGE                EVM / HEDERA IMMUTABLE PROOF
   ┌────────────────────────────────────────┐       ┌────────────────────────────────────────┐
   │ • User Profiles & Phone Numbers        │       │ • Canonical SHA-256 Event Hashes       │
   │ • CFA Member Roster & Approvals        │       │ • On-Chain Impact Certificates (NFTs)  │
   │ • Nursery Batch Quantities & Seedlings │       │ • Reward Token Balances & Vault Claims │
   │ • Photos with EXIF GPS Metadata        │       │ • Anchor Timestamps & Block Proofs     │
   │ • Detailed AI Analytics & Metrics      │       │ • Smart Contract Treasury Balances     │
   └────────────────────────────────────────┘       └────────────────────────────────────────┘
```

---

## 4. CFA Onboarding & Member Approval Workflow

### 4.1 CFA Membership State Machine

```
   USER REGISTERS VIA PRIVY (Google / Phone)
                     │
                     ▼
          SELECT "JOIN A CFA" ROLE
                     │
                     ▼
     SEARCH & SELECT LOCAL REGISTRATION
         (e.g., "Ngong Hills CFA")
                     │
                     ▼
       SUBMIT MEMBERSHIP REQUEST ───► Status: PENDING
                     │
                     ▼
        CFA ADMINISTRATOR REVIEWS
        ┌────────────┴────────────┐
        ▼                         ▼
    APPROVED                   REJECTED
        │
        ▼
 Status: ACTIVE
 Assigned Role: (NURSERY_MANAGER / PLANTER / VALIDATOR)
```

---

## 5. Nursery Digital Inventory & RWA Lifecycle

Rather than simply recording aggregate "trees planted", KAI tracks seedling propagation through a structured **Nursery Batch & Asset Lifecycle**:

```
 ┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
 │  SEED RECEIVED     │─────►│  NURSERY BATCH     │─────►│  GERMINATING       │
 │  Batch #NUR-2026-1 │      │  5,000 Bamboo      │      │  4,850 Seedlings   │
 └────────────────────┘      └────────────────────┘      └─────────┬──────────┘
                                                                   │
                                                                   ▼
 ┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
 │ IMPACT EVENT &     │◄─────│ PLANTING EVENT     │◄─────│ ALLOCATED          │
 │ EVM PROOF    │      │ Field Location GPS │      │ Project: Jaza Miti │
 └────────────────────┘      └────────────────────┘      └────────────────────┘
```

---

## 6. Verification Architecture & Cryptographic Hashing

To ensure data authenticity before committing proofs to Ethereum & Hedera (X402), KAI enforces a **Canonical JSON Hashing System**:

### 6.1 Verification Processing Pipeline

```
1. USER SUBMITS EVENT JSON + PHOTOS TO API
                     │
                     ▼
2. BACKEND CALCULATES CANONICAL SHA-256 HASH
   payloadHash = sha256(canonicalize(eventJson))
                     │
                     ▼
3. STORE EVENT & EVIDENCE IN POSTGRESQL / IPFS
                     │
                     ▼
4. VALIDATOR REVIEW & AI INTEGRITY CHECK
                     │
                     ▼
5. ANCHOR HASH TO ETHEREUM & HEDERA SMART CONTRACT
   txHash = KAIAirDropVault.anchorEvent(eventId, payloadHash)
```

---

## 7. Developer Implementation Roadmap

| Phase | Milestone | Primary Deliverable |
| :--- | :--- | :--- |
| **Phase 1** | **Privy Auth Integration** | Install `@privy-io/react-auth` & `@privy-io/wagmi`. Wrap Next.js App Router in `PrivyProvider` configured for Ethereum & Hedera (X402) / Sepolia testnet. |
| **Phase 2** | **Dual Identity API** | Implement `/api/auth/sync-user` API route to create/fetch `users` and link `wallets` upon successful Privy login. |
| **Phase 3** | **CFA Onboarding UI** | Build CFA registration portal and Member Request approval desk (`/cfa/join` & `/cfa/admin`). |
| **Phase 4** | **Nursery Digital Inventory** | Build `/nursery` batch tracker and inventory state event logger. |
| **Phase 5** | **Proof Anchoring Queue** | Deploy background worker using Viem to read `PENDING` events and commit `SHA-256` payload hashes to Sepolia / Hedera Rails (X402). |
| **Phase 6** | **Impact Investor Attribution** | Build `/investor` portal displaying live project allocations and verified tree survival metrics. |
| **Phase 7** | **KAI Agent Natural Queries** | Connect read-only DB views to KAI AI Agent for natural language queries (e.g. *"How many bamboo seedlings are ready in Ngong Nursery?"*). |

---

> [!NOTE]
> All wallet transactions triggered by the user via Privy embedded wallets can be configured with **gasless sponsorship (Paymaster)** on Ethereum & Hedera (X402) to provide a 100% friction-free experience for community members.
