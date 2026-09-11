# KAI — Unified Impact & Real-World Asset (RWA) Database Schema
## Product Requirements Document (PRD) & Technical Database Specification

**Version:** 1.0 (Consolidated MVP & Production Roadmap)  
**Target Network:** Ethereum & Hedera (X402) / Sepolia Testnet  
**Primary Database Engine:** PostgreSQL 15+ / Neon DB  
**Evidence Storage:** IPFS / Decentralized Object Storage  
**Primary Consumers:** Web/Mobile Developers, Backend Engineers, KAI Intelligence Agents  

---

## 1. Executive Summary & System Architecture

KAI unifies Community Forest Associations (CFAs), MSMEs/Chamas, tree nurseries, apiculture, eco-tourism, and conservation activities into a single **Ethereum & Hedera-powered Real-World Asset (RWA) & Impact Ledger**.

### 1.1 Data Layer Philosophy (Off-Chain Speed + On-Chain Proof)

```
                       ┌────────────────────────────────────────────────────────┐
                       │          🤖 KAI Intelligent Business Agent             │
                       │   (Natural Language Queries, RAG, Analytics, AI)       │
                       └───────────────────────────┬────────────────────────────┘
                                                   │
        ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
        ▼                                          ▼                                          ▼
┌───────────────────────────┐          ┌───────────────────────────┐          ┌───────────────────────────┐
│ 🐘 PostgreSQL (Neon DB)   │          │ 📦 IPFS / Storage Bucket  │          │ 🔺 Ethereum & Hedera (X402)      │
│   Operational Source of   │◄─────────┤   Raw Evidence, Photos,   ├─────────►│   Immutable Cryptographic │
│   Truth & State Machine   │          │   Sensor Logs & Documents │          │   Hash & Timestamp Anchor │
└───────────────────────────┘          └───────────────────────────┘          └───────────────────────────┘
```

1. **PostgreSQL (Neon DB):** Serves as the operational state machine (fast queries, full relational integrity, RBAC, nursery inventory, financial ledger).
2. **IPFS / Object Storage:** Stores rich proof evidence (photos with EXIF GPS metadata, drone imagery, raw sensor payloads, documents).
3. **Ethereum & Hedera (X402):** Holds cryptographic hashes (`SHA-256`) of canonical event records and IPFS URIs for tamper-evident timestamps and reward issuance.

---

## 2. Consolidated Entity Architecture

To prevent schema bloat and redundant tables, domain activities (planting, honey harvesting, inventory transfers, eco-tourism visits) are consolidated into a **Unified Asset & Event Ledger** model:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 CORE ENTITY MODEL                                      │
└────────────────────────────────────────────────────────────────────────────────────────┘

 ┌──────────────┐         ┌───────────────────┐         ┌───────────────────┐
 │    users     │─────────┤   organizations   │─────────┤     projects      │
 └──────┬───────┘         └─────────┬─────────┘         └─────────┬─────────┘
        │                           │                             │
 ┌──────┴───────┐         ┌─────────┴─────────┐         ┌─────────┴─────────┐
 │   wallets    │         │    nurseries      │         │    assets/trees   │
 └──────────────┘         └─────────┬─────────┘         └─────────┬─────────┘
                                    │                             │
                          ┌─────────┴─────────┐                   │
                          │  nursery_batches  │                   │
                          └─────────┬─────────┘                   │
                                    │                             │
                                    └──────────────┬──────────────┘
                                                   │
                                                   ▼
                                        ┌───────────────────┐
                                        │   impact_events   │ (Unified Event Journal)
                                        └─────────┬─────────┘
                                                  │
                                ┌─────────────────┼─────────────────┐
                                ▼                 ▼                 ▼
                        ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
                        │   evidence    │ │ verifications │ │  anchors/nfts │
                        └───────────────┘ └───────────────┘ └───────────────┘
```

---

## 3. Database Schema (PostgreSQL DDL)

Below is the production-ready PostgreSQL DDL script with full foreign key constraints, indexes, and ENUM declarations.

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. ENUM DEFINITIONS
-- =============================================================================

CREATE TYPE user_role AS ENUM (
    'USER', 'CFA_ADMIN', 'CFA_MEMBER', 'NURSERY_MANAGER',
    'VALIDATOR', 'SME', 'INVESTOR', 'ADMIN'
);

CREATE TYPE organization_type AS ENUM (
    'CFA', 'SME', 'NGO', 'FOUNDATION', 'GOVERNMENT', 'COOPERATIVE', 'NURSERY_FACILITY'
);

CREATE TYPE verification_status AS ENUM (
    'PENDING', 'VERIFYING', 'PARTIALLY_VERIFIED', 'VERIFIED', 'REJECTED', 'DISPUTED'
);

CREATE TYPE asset_type AS ENUM (
    'TREE', 'FARM', 'HIVE', 'NURSERY', 'WATER_PROJECT', 'ECOTOURISM_SITE', 'CULTURAL_ASSET', 'PRODUCT'
);

CREATE TYPE nursery_batch_status AS ENUM (
    'SEED', 'GERMINATING', 'GROWING', 'READY', 'DISTRIBUTED', 'CLOSED'
);

CREATE TYPE inventory_event_type AS ENUM (
    'SEED_RECEIVED', 'GERMINATED', 'GROWTH_UPDATE', 'LOSS',
    'TRANSFER_IN', 'TRANSFER_OUT', 'ALLOCATED', 'DISTRIBUTED', 'PLANTED', 'ADJUSTMENT'
);

CREATE TYPE blockchain_anchor_status AS ENUM (
    'PENDING', 'CONFIRMED', 'FAILED'
);

CREATE TYPE investor_type AS ENUM (
    'INDIVIDUAL', 'CORPORATE', 'FOUNDATION', 'NGO', 'INSTITUTION', 'OTHER'
);

CREATE TYPE reward_type AS ENUM (
    'POINTS', 'KAI_TOKEN', 'NFT', 'CERTIFICATE', 'BADGE'
);

-- =============================================================================
-- 2. USERS, WALLETS & ORGANIZATIONS
-- =============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    avatar_url TEXT,
    role user_role DEFAULT 'USER',
    kyc_status VARCHAR(50) DEFAULT 'NOT_REQUIRED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    address VARCHAR(128) NOT NULL UNIQUE,
    chain VARCHAR(50) DEFAULT 'ETHEREUM',
    network VARCHAR(50) DEFAULT 'SEPOLIA',
    is_primary BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    org_type organization_type NOT NULL,
    registration_number VARCHAR(100),
    description TEXT,
    country VARCHAR(100) DEFAULT 'Kenya',
    county VARCHAR(100),
    sub_county VARCHAR(100),
    ward VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    verification_status verification_status DEFAULT 'PENDING',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    membership_number VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
    status VARCHAR(50) DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    UNIQUE(organization_id, user_id)
);

-- =============================================================================
-- 3. INITIATIVES, PROJECTS & SPECIES REGISTRY
-- =============================================================================

CREATE TABLE initiatives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g., REFORESTATION, APICULTURE, ECOTOURISM
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    initiative_id UUID NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_quantity DECIMAL(12, 2),
    target_unit VARCHAR(50), -- e.g., 'TREES', 'KG_HONEY', 'HECTARES'
    budget_amount DECIMAL(14, 2),
    currency VARCHAR(10) DEFAULT 'KES',
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE species (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scientific_name VARCHAR(255) NOT NULL,
    common_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- INDIGENOUS, FRUIT, BAMBOO, AGROFORESTRY
    is_native BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 4. NURSERY & INVENTORY TRACKING
-- =============================================================================

CREATE TABLE nurseries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    nursery_code VARCHAR(100) UNIQUE NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    area_hectares DECIMAL(8, 2),
    manager_user_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nursery_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nursery_id UUID NOT NULL REFERENCES nurseries(id) ON DELETE CASCADE,
    species_id UUID NOT NULL REFERENCES species(id),
    batch_number VARCHAR(100) UNIQUE NOT NULL,
    seed_source VARCHAR(255),
    initial_quantity INT NOT NULL CHECK (initial_quantity >= 0),
    germinated_quantity INT DEFAULT 0 CHECK (germinated_quantity >= 0),
    current_quantity INT NOT NULL CHECK (current_quantity >= 0),
    lost_quantity INT DEFAULT 0 CHECK (lost_quantity >= 0),
    distributed_quantity INT DEFAULT 0 CHECK (distributed_quantity >= 0),
    sowing_date DATE NOT NULL,
    expected_ready_date DATE,
    status nursery_batch_status DEFAULT 'SEED',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 5. GENERIC REAL-WORLD ASSET (RWA) REGISTRY
-- =============================================================================

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_code VARCHAR(100) UNIQUE NOT NULL,
    asset_type asset_type NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    project_id UUID REFERENCES projects(id),
    nursery_batch_id UUID REFERENCES nursery_batches(id),
    species_id UUID REFERENCES species(id),
    name VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'ACTIVE', -- SEEDLING, PLANTED, SURVIVING, MATURE, HARVESTED
    metadata JSONB DEFAULT '{}',
    planted_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 6. UNIFIED IMPACT EVENT LEDGER
-- =============================================================================

CREATE TABLE impact_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_code VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- TREE_PLANTING, GERMINATION, HONEY_HARVEST, ECO_TOUR, CASH_SAVINGS
    organization_id UUID REFERENCES organizations(id),
    project_id UUID REFERENCES projects(id),
    initiative_id UUID REFERENCES initiatives(id),
    nursery_batch_id UUID REFERENCES nursery_batches(id),
    asset_id UUID REFERENCES assets(id),
    submitted_by UUID NOT NULL REFERENCES users(id),
    quantity DECIMAL(12, 2),
    unit VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    event_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload JSONB NOT NULL DEFAULT '{}', -- Flexible custom metadata
    payload_hash VARCHAR(64) NOT NULL, -- SHA-256 of canonical payload
    verification_status verification_status DEFAULT 'PENDING',
    verification_score DECIMAL(5, 2) DEFAULT 0.00,
    blockchain_status blockchain_anchor_status DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nursery_inventory_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nursery_id UUID NOT NULL REFERENCES nurseries(id),
    batch_id UUID NOT NULL REFERENCES nursery_batches(id),
    impact_event_id UUID REFERENCES impact_events(id),
    event_type inventory_event_type NOT NULL,
    quantity INT NOT NULL,
    previous_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    reason TEXT,
    performed_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 7. EVIDENCE, VALIDATION & REPUTATION
-- =============================================================================

CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    impact_event_id UUID NOT NULL REFERENCES impact_events(id) ON DELETE CASCADE,
    evidence_type VARCHAR(50) NOT NULL, -- PHOTO, VIDEO, DOCUMENT, GPS_LOG, SENSOR
    storage_uri TEXT NOT NULL, -- ipfs://... or s3://...
    content_hash VARCHAR(64) NOT NULL,
    metadata JSONB DEFAULT '{}',
    submitted_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE validators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    validator_type VARCHAR(50) DEFAULT 'COMMUNITY', -- COMMUNITY, EXPERT, AI, AUDITOR
    reputation_score DECIMAL(5, 2) DEFAULT 100.00,
    total_validations INT DEFAULT 0,
    approved_validations INT DEFAULT 0,
    rejected_validations INT DEFAULT 0,
    accuracy_rate DECIMAL(5, 2) DEFAULT 100.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    impact_event_id UUID NOT NULL REFERENCES impact_events(id) ON DELETE CASCADE,
    validator_id UUID NOT NULL REFERENCES validators(id),
    decision VARCHAR(50) NOT NULL, -- APPROVED, REJECTED, FLAGGED
    confidence_score DECIMAL(5, 2) CHECK (confidence_score BETWEEN 0 AND 100),
    comments TEXT,
    verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 8. IMPACT FINANCE, ATTRIBUTION & REWARDS
-- =============================================================================

CREATE TABLE investors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    investor_type investor_type NOT NULL DEFAULT 'INDIVIDUAL',
    display_name VARCHAR(255) NOT NULL,
    public_profile BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investor_id UUID NOT NULL REFERENCES investors(id),
    project_id UUID REFERENCES projects(id),
    organization_id UUID REFERENCES organizations(id),
    amount DECIMAL(14, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) DEFAULT 'KES',
    investment_type VARCHAR(50) DEFAULT 'GRANT',
    status VARCHAR(50) DEFAULT 'COMPLETED',
    date_invested TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE impact_attributions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    investor_id UUID NOT NULL REFERENCES investors(id),
    investment_id UUID NOT NULL REFERENCES investments(id),
    impact_event_id UUID NOT NULL REFERENCES impact_events(id),
    attribution_percentage DECIMAL(5, 2) NOT NULL,
    attributed_quantity DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    impact_event_id UUID REFERENCES impact_events(id),
    reward_type reward_type NOT NULL,
    amount DECIMAL(14, 4),
    token_symbol VARCHAR(20) DEFAULT 'KAI',
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    distributed_at TIMESTAMPTZ
);

CREATE TABLE blockchain_anchors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- e.g., 'IMPACT_EVENT', 'NURSERY_BATCH'
    entity_id UUID NOT NULL,
    network VARCHAR(50) DEFAULT 'ETHEREUM',
    chain VARCHAR(50) DEFAULT 'ETHEREUM',
    payload_hash VARCHAR(64) NOT NULL,
    tx_hash VARCHAR(128),
    block_number BIGINT,
    status blockchain_anchor_status DEFAULT 'PENDING',
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMPTZ
);

-- =============================================================================
-- 9. PERFORMANCE INDEXES
-- =============================================================================

CREATE INDEX idx_users_email_phone ON users(email, phone);
CREATE INDEX idx_org_memberships_org_user ON org_memberships(organization_id, user_id);
CREATE INDEX idx_nurseries_org ON nurseries(organization_id);
CREATE INDEX idx_nursery_batches_nursery_species ON nursery_batches(nursery_id, species_id);
CREATE INDEX idx_assets_type_status ON assets(asset_type, status);
CREATE INDEX idx_impact_events_org_type ON impact_events(organization_id, event_type, verification_status);
CREATE INDEX idx_impact_events_date ON impact_events(event_date DESC);
CREATE INDEX idx_evidence_event ON evidence(impact_event_id);
CREATE INDEX idx_verifications_event_validator ON verifications(impact_event_id, validator_id);
CREATE INDEX idx_blockchain_anchors_entity ON blockchain_anchors(entity_type, entity_id);
```

---

## 4. Nursery Inventory Lifecycle & State Machine

```
  SEED RECEIVED (Initial Batch Creation)
        │
        ▼
   GERMINATING (Seeds planted in trays)
        │
        ▼
     GROWING (Seedlings repotted & monitored)
        │
        ├───► LOSS (Recorded in nursery_inventory_events)
        ▼
      READY (Ready for planting / distribution)
        │
        ├───► ALLOCATED (Reserved for Jaza Miti Project)
        │
        ▼
   DISTRIBUTED / PLANTING EVENT
        │
        ▼
 IMPACT EVENT GENERATED & ANCHORED ON ETHEREUM & HEDERA
```

---

## 5. Structured JSON API Payload & Hash Generation

When a CFA member or mobile device submits an activity, the API computes the **Canonical SHA-256 Hash** before writing to PostgreSQL and anchoring to Ethereum & Hedera.

### 5.1 Canonical Request JSON Payload
```json
{
  "eventCode": "IMP-20260901-0042",
  "eventType": "TREE_PLANTING",
  "organizationId": "c0a80101-8888-4444-9999-000000000001",
  "projectId": "p0a80101-1111-2222-3333-000000000002",
  "nurseryBatchId": "b0a80101-5555-6666-7777-000000000003",
  "submittedBy": "u0a80101-9999-8888-7777-000000000004",
  "quantity": 50,
  "unit": "TREES",
  "location": {
    "latitude": -1.29210000,
    "longitude": 36.82190000
  },
  "eventDate": "2026-09-01T12:00:00Z",
  "evidence": [
    {
      "type": "PHOTO",
      "storageUri": "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      "contentHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ]
}
```

---

## 6. Implementation Roadmap & Developer Tasks

| Phase | Module | Target Deliverables |
| :--- | :--- | :--- |
| **Phase 1** | **Identity & Orgs** | Run schema migration (`users`, `wallets`, `organizations`, `org_memberships`). Implement JWT + Wagmi wallet auth endpoints. |
| **Phase 2** | **Nursery Module** | Build Nursery CRUD + Batch Management API (`/api/nurseries`, `/api/nursery-batches`). Implement transactional inventory log triggers. |
| **Phase 3** | **RWA & Impact Ledger** | Implement `/api/impact-events` with automated SHA-256 payload hashing and IPFS file upload integration. |
| **Phase 4** | **Verification Engine** | Build validator approval workflow, reputation calculator service, and dispute resolution logic. |
| **Phase 5** | **Ethereum & Hedera Anchoring** | Deploy background queue to read `PENDING` `blockchain_anchors` and commit state roots to Sepolia / Hedera Testnet testnet contract. |
| **Phase 6** | **Impact Finance** | Build investor onboarding, funding allocations, and automated impact attribution engine. |
| **Phase 7** | **KAI AI Agent Integration** | Connect KAI RAG agent (`ai-agent/server.py`) to PostgreSQL via read-only views for natural language queries. |

---

> [!NOTE]
> All schema tables strictly enforce **UTF-8 encoding**, **timestamptz timezone awareness**, and **referential integrity**. Foreign key constraints ensure no orphan inventory events or impact claims can exist.
