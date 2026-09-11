# Product Requirements Document (PRD) & Database Schema
## Tree Nursery & Seedling Lifecycle Management System

> **Version:** 1.0.0  
> **Target Platform:** KAI Nuvari Protocol (Next.js + Neon Postgres + Paystack / Ethereum & Hedera)  
> **Focus Area:** Tree Nursery Groups, Seedling Inventory, Movement Tracking, Geotagged Planting, and Community Payments.

---

## 1. Executive Summary & Vision

Before trees can accumulate verified carbon in a forest MRV system, they begin as seedlings in **Community Tree Nurseries**. 

This system provides an end-to-end digital registry for:
1. **Nursery Inventory Management:** Tracking seedling batches from seed germination to readiness.
2. **Batch Movement:** Transparent chain-of-custody as saplings move from nurseries to field planting sites.
3. **Geotagged Planting Attribution:** Exact spatial recording of *where* trees are planted and *who* planted them.
4. **Automated Payments:** Instant financial payouts (M-Pesa / Paystack / Stablecoins) for nursery owners and community planters upon verified delivery and planting.

---

## 2. User Personas & Workflows

```
┌─────────────────┐       Dispatch Batch      ┌─────────────────┐
│ Nursery Manager ├──────────────────────────►│  Field Transport│
└────────┬────────┘                           └────────┬────────┘
         │                                             │ Receive & Plant
         │ Receives Payment                            ▼
         │ (Seedling Sales)                   ┌─────────────────┐
         └────────────────────────────────────┤  Community      │
                                              │  Planter        │
                                              └────────┬────────┘
                                                       │ Geotag & Submit
                                                       ▼
                                              ┌─────────────────┐
                                              │ Verified Tree   │
                                              │ Asset (On-chain)│
                                              └─────────────────┘
```

| Persona | Primary Goal | Key Actions |
|---|---|---|
| **Nursery Group Manager** | Log seedling batches, sell saplings, receive payouts | Create batches, update growth stages, dispatch transfers, receive sales revenue |
| **Community Planter** | Plant trees, earn bounties per verified seedling | Receive batch transfers, geotag planting locations, claim planting rewards |
| **Field Inspector / Auditor** | Verify planting survival rate & location accuracy | Review batch delivery, approve planting claims for payout release |

---

## 3. Database Schema (Prisma ORM)

File: `prisma/schema.prisma`

```prisma
// ============================================================================
// 1. TREE NURSERY GROUPS & FACILITIES
// ============================================================================
model NurseryGroup {
  id             String          @id @default(cuid())
  name           String          // e.g. "Kipkelion Community Tree Nursery"
  registrationNo String?         // Official CBO / Group Reg Number
  region         String          // e.g. "Kericho County, Kenya"
  gpsLatitude    Float
  gpsLongitude   Float
  contactPhone   String          // M-Pesa / Paystack payout phone
  payoutWallet   String?         // On-chain treasury wallet (Ethereum & Hedera)
  managerName    String
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  seedlingBatches SeedlingBatch[]
  dispatches      BatchTransfer[] @relation("SourceNursery")
  payments        NurseryPayment[]

  @@map("nursery_groups")
}

// ============================================================================
// 2. SEEDLING INVENTORY BATCHES
// ============================================================================
model SeedlingBatch {
  id               String          @id @default(cuid())
  nurseryId        String
  batchNumber      String          @unique // e.g. "NUR-2026-BATCH-089"
  speciesCommon    String          // e.g. "Bamboo", "Markhamia lutea", "Prunus africana"
  speciesScientific String?        // e.g. "Prunus africana"
  category         SpeciesCategory @default(INDIGENOUS)
  quantityPotted   Int             // Total seeds planted
  quantityReady    Int             // Saplings ready for field transfer
  quantityDispatched Int           @default(0) // Saplings moved to field
  unitPriceKes     Float           // Price per seedling in KES
  datePotted       DateTime
  expectedReadyDate DateTime
  status           BatchStatus     @default(GERMINATING)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  nursery          NurseryGroup    @relation(fields: [nurseryId], references: [id])
  transfers        BatchTransfer[]
  plantedTrees     PlantedTree[]

  @@index([nurseryId])
  @@index([speciesCommon])
  @@map("seedling_batches")
}

enum SpeciesCategory {
  INDIGENOUS
  EXOTIC
  FRUIT_BEARING
  AGROFORESTRY
}

enum BatchStatus {
  GERMINATING
  GROWING
  READY_FOR_PLANTING
  EXHAUSTED
}

// ============================================================================
// 3. SEEDLING MOVEMENT & CHAIN OF CUSTODY
// ============================================================================
model BatchTransfer {
  id               String         @id @default(cuid())
  transferRef      String         @unique // e.g. "TRF-2026-0045"
  batchId          String
  sourceNurseryId  String
  destinationSite  String         // e.g. "Chepalungu Block B Restoration Site"
  quantityMoved    Int
  dispatchedBy     String         // Dispatcher name or member ID
  receivedByPlanterId String?     // Target planter receiving the batch
  status           TransferStatus @default(IN_TRANSIT)
  dispatchedAt     DateTime       @default(now())
  receivedAt       DateTime?

  batch            SeedlingBatch  @relation(fields: [batchId], references: [id])
  sourceNursery    NurseryGroup   @relation("SourceNursery", fields: [sourceNurseryId], references: [id])
  planter          TreePlanter?   @relation(fields: [receivedByPlanterId], references: [id])
  plantedTrees     PlantedTree[]

  @@map("batch_transfers")
}

enum TransferStatus {
  IN_TRANSIT
  DELIVERED
  CANCELLED
}

// ============================================================================
// 4. PLANTER PROFILES & GEOTAGGED INDIVIDUAL TREES
// ============================================================================
model TreePlanter {
  id             String          @id @default(cuid())
  fullName       String
  phoneNumber    String          @unique // Receives planting bounty via Paystack/M-Pesa
  walletAddress  String?         // Ethereum & Hedera address for digital certificates
  nationalId     String?         // Identity verification
  totalPlanted   Int             @default(0)
  totalEarnedKes Float           @default(0)
  createdAt      DateTime        @default(now())

  transfers      BatchTransfer[]
  plantedTrees   PlantedTree[]
  payments       NurseryPayment[] @relation("PlanterPayouts")

  @@map("tree_planters")
}

model PlantedTree {
  id             String          @id @default(cuid())
  treeTagId      String          @unique // e.g. "KAI-TREE-2026-8849"
  batchId        String
  transferId     String?
  planterId      String
  species        String
  
  // Precise Geotagging & Location
  gpsLatitude    Float
  gpsLongitude   Float
  altitudeMeters Float?
  landOwnerName  String?         // Community / Private / Public land tag
  
  // Verification Data
  photoIpfsHash  String          // Geotagged photo proof on IPFS
  healthStatus   TreeHealth      @default(ALIVE_HEALTHY)
  datePlanted    DateTime        @default(now())
  lastInspected  DateTime?
  
  batch          SeedlingBatch   @relation(fields: [batchId], references: [id])
  transfer       BatchTransfer?  @relation(fields: [transferId], references: [id])
  planter        TreePlanter     @relation(fields: [planterId], references: [id])

  @@index([gpsLatitude, gpsLongitude])
  @@index([planterId])
  @@map("planted_trees")
}

enum TreeHealth {
  ALIVE_HEALTHY
  STUNTED
  DAMAGED
  DEAD
}

// ============================================================================
// 5. PAYMENTS & FINANCIAL SETTLEMENT
// ============================================================================
model NurseryPayment {
  id               String        @id @default(cuid())
  reference        String        @unique // Paystack transaction reference
  amountKes        Float
  purpose          PaymentPurpose
  status           PaymentStatus @default(PENDING)
  
  // Beneficiaries
  nurseryId        String?
  planterId        String?
  
  paymentMethod    String        @default("PAYSTACK") // PAYSTACK | MPESA | ONCHAIN_STABLECOIN
  paystackEmail    String?
  recipientPhone   String?
  paidAt           DateTime?
  createdAt        DateTime      @default(now())

  nursery          NurseryGroup? @relation(fields: [nurseryId], references: [id])
  planter          TreePlanter?  @relation("PlanterPayouts", fields: [planterId], references: [id])

  @@index([reference])
  @@map("nursery_payments")
}

enum PaymentPurpose {
  SEEDLING_PURCHASE   // Payment to Nursery for purchasing batch
  PLANTING_BOUNTY     // Incentive paid to Planter for planting tree
  MAINTENANCE_REWARD  // Subsequent reward for tree survival after 6 months
}

enum PaymentStatus {
  PENDING
  SUCCESS
  FAILED
}
```

---

## 4. Key API Endpoint Definitions

| Method | Endpoint | Description |
|---|---|---|
| **POST** | `/api/nursery/batches` | Register a new seedling batch in the nursery |
| **GET** | `/api/nursery/inventory?nurseryId=xxx` | Get live seedling inventory by species and status |
| **POST** | `/api/nursery/transfers` | Dispatch a seedling batch to a field location |
| **POST** | `/api/trees/plant` | Geotag & log a newly planted tree (uploads photo to IPFS) |
| **GET** | `/api/trees/planter/:id` | Get planter profile, total trees planted, and earnings |
| **POST** | `/api/payments/payout-bounty` | Trigger Paystack/M-Pesa bounty payment to planter or nursery |

---

## 5. Sample API Request Payloads

### A. Geotag & Register Planted Tree (`POST /api/trees/plant`)

```json
{
  "batchId": "clx123abc...",
  "transferId": "clx456def...",
  "planterId": "clx789ghi...",
  "species": "Prunus africana",
  "gpsLatitude": -0.51234,
  "gpsLongitude": 35.78912,
  "altitudeMeters": 2150.0,
  "landOwnerName": "Chepalungu Community Land Block 4",
  "photoIpfsHash": "ipfs://bafybeigdyr3m5faj5b6ab5d6m2p..."
}
```

### B. Trigger Planter Bounty Payout (`POST /api/payments/payout-bounty`)

```json
{
  "planterId": "clx789ghi...",
  "treesCount": 50,
  "ratePerTreeKes": 50.0,
  "totalAmountKes": 2500.0,
  "recipientPhone": "254712345678",
  "paystackEmail": "planter@community.org"
}
```

---

## 6. Next Implementation Steps

1. **Database Schema Push:** Add models to `frontend/prisma/schema.prisma` and run `npx prisma db push`.
2. **Nursery Inventory UI:** Build a mobile-first nursery management dashboard for logging batches and transfers.
3. **Geotagging Web App:** Build a simple field PWA screen for planters to take a photo, grab GPS coordinates, and submit planted trees.
4. **Paystack Bounty Route:** Wire up `/api/payments/payout-bounty` so planters receive automated mobile payouts.

---

## 7. Tree Survival Rate Measurement & Verification Engine

To calculate accurate survival rates for batches, zones, and individual planters, the system uses a **Time-Series Verification Protocol** combined with automated survival metrics formulas.

```
 📊 Day 0: Planted & Geotagged ──► 📸 3-Month Check (20% Payout) ──► 📸 6-Month Check (40% Payout) ──► 🌳 1-Year Survival Verified (Mint Carbon Credit)
```

### A. Extended Prisma Schema for Survival Tracking

Add a `TreeInspection` time-series model to track every tree's growth and health status over multiple inspection cycles:

```prisma
// ============================================================================
// 6. TIME-SERIES SURVIVAL INSPECTIONS
// ============================================================================
model TreeInspection {
  id               String           @id @default(cuid())
  treeId           String
  inspectorId      String           // Planter or Field Auditor ID
  inspectionDate   DateTime         @default(now())
  milestone        SurvivalMilestone // 3_MONTHS, 6_MONTHS, 1_YEAR, 3_YEARS
  
  // Physical Growth Metrics
  status           TreeHealthStatus // ALIVE_HEALTHY, STUNTED, DAMAGED, DEAD, MISSING
  heightCm         Float?           // Tree height in cm
  stemDiameterMm   Float?           // Stem diameter at ground level
  canopyDiameterCm Float?           // Canopy spread
  
  // Verification Evidence
  photoIpfsHash    String           // New geotagged photo proof on IPFS
  gpsDistanceDelta Float?           // Distance error in meters from original planting geotag
  aiConfidenceScore Float?          // AI visual verification score (0.0 - 1.0)
  notes            String?

  tree             PlantedTree      @relation(fields: [treeId], references: [id])

  @@index([treeId])
  @@index([milestone])
  @@map("tree_inspections")
}

enum SurvivalMilestone {
  DAY_ZERO
  THREE_MONTHS
  SIX_MONTHS
  ONE_YEAR
  TWO_YEARS
  THREE_YEARS
}

enum TreeHealthStatus {
  ALIVE_HEALTHY
  STUNTED
  DAMAGED
  DEAD
  MISSING
}
```

---

### B. Survival Rate Calculation Formula

Survival rate is measured dynamically across **3 levels**:

#### 1. Individual Batch Survival Rate ($S_{batch}$)
$$\text{Survival Rate (\%)} = \left( \frac{\text{Count of Verified ALIVE\_HEALTHY Trees}}{\text{Total Trees Dispatched in Batch}} \right) \times 100$$

#### 2. Planter Success Score ($S_{planter}$)
$$\text{Planter Survival Score} = \left( \frac{\sum \text{Alive Trees Inspected at 6 Months}}{\sum \text{Total Trees Planted by Planter}} \right) \times 100$$

#### 3. Species Adaptation Index
Measures which tree species have the highest survival percentage in specific GPS zones/counties.

---

### C. 3-Tier Survival Verification Method

To ensure community data cannot be faked, tree survival is cross-verified using three layers:

| Layer | Method | How it works |
|---|---|---|
| **Layer 1: Geotag Proximity Match** | GPS & Distance Delta | Inspection photo must be taken within **5 meters** of original planting GPS coordinates. |
| **Layer 2: AI Photo Growth Check** | Mobile Vision AI | AI agent compares the 6-month photo with Day 0 photo to detect height increase & leaf canopy growth. |
| **Layer 3: Satellite NDVI Tracking** | Remote Sensing | Sentinel-2 multispectral imagery tracks greening index (NDVI) increase over the planting zone polygon. |

---

### D. Milestone-Based Payout Trigger Logic

Payments are released in **performance milestones** tied directly to verified survival checks:

```
Total Incentive per Tree = 100 KES

├── Day 0 (Planting Verified):         20 KES (20%) ──► Upfront planting bounty
├── 6-Month Survival Confirmed:       40 KES (40%) ──► Released ONLY if tree is ALIVE
└── 1-Year Survival & Carbon Mint:    40 KES (40%) ──► Released + Carbon Credit Issued
```

If a tree is marked `DEAD` or `MISSING` during the 6-month inspection:
1. Payout for that tree is automatically frozen.
2. The batch's survival rate rating is updated in real time.
3. The nursery group is flagged to supply replacement saplings.

---

## 8. Governance Roles & Member Activity Tracking System

To support Community Based Organizations (CBOs), impact investors, and active field workers, the system defines granular organizational roles and a comprehensive activity ledger.

```
                   ┌──────────────────────────────────┐
                   │    💚 Impact Investors / CSR     │
                   │ (Capital, Carbon Offsets, ROI)   │
                   └────────────────┬─────────────────┘
                                    │ Funding / Grants
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   🏛️ CBO / Nursery Organization                        │
│                                                                        │
│  👑 Chairman    🥈 Vice Chair    📝 Secretary    💰 Treasurer          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Governance & Distribution
                                    ▼
                   ┌──────────────────────────────────┐
                   │   🧑‍🌾 Value Creators / Members   │
                   │ (Potted Seeds, Planted, Patrols) │
                   └──────────────────────────────────┘
```

### A. Comprehensive Role & Governance Schema

Add these models to `prisma/schema.prisma`:

```prisma
// ============================================================================
// 7. USER STAKEHOLDER ROLES & CBO GOVERNANCE
// ============================================================================

enum StakeholderCategory {
  IMPACT_INVESTOR       // External funder, corporate CSR, carbon credit buyer
  VALUE_CREATOR_GROUND  // Active planter, nursery worker, forest guardian
  ORGANIZATION_LEADER   // CBO executive committee member
}

enum GovernanceRole {
  CHAIRMAN              // Group leader, signs off financial payouts
  VICE_CHAIRMAN         // Secondary approver
  SECRETARY             // Records meeting minutes, logs member attendance
  TREASURER             // Manages group wallet / Paystack accounts & funds
  COMMITTEE_MEMBER      // General executive committee
  GENERAL_MEMBER        // Standard community group member
  IMPACT_INVESTOR       // Funder role
}

// ============================================================================
// 8. IMPACT INVESTOR PROFILES & SPONSORSHIPS
// ============================================================================
model ImpactInvestor {
  id                   String            @id @default(cuid())
  organizationName     String            // e.g. "Green Climate Fund", "Acme Corp CSR"
  investorType         InvestorType      @default(CORPORATE_CSR)
  contactEmail         String            @unique
  walletAddress        String?           // Ethereum & Hedera wallet for Carbon NFTs
  totalCapitalInvested Float             @default(0) // Total KES / USD contributed
  totalCarbonCredits   Float             @default(0) // Total tCO2e purchased
  createdAt            DateTime          @default(now())

  sponsorships         ProjectSponsorship[]

  @@map("impact_investors")
}

enum InvestorType {
  INDIVIDUAL
  CORPORATE_CSR
  INSTITUTIONAL_FUND
  NGO
}

model ProjectSponsorship {
  id                 String         @id @default(cuid())
  investorId         String
  nurseryId          String?
  targetTreesCount   Int
  amountFundedKes    Float
  fundedAt           DateTime       @default(now())

  investor           ImpactInvestor @relation(fields: [investorId], references: [id])
  nursery            NurseryGroup?  @relation(fields: [nurseryId], references: [id])

  @@map("project_sponsorships")
}

// ============================================================================
// 9. MEMBER ACTIVITY TRACKING LEDGER
// ============================================================================
model MemberActivityLog {
  id               String          @id @default(cuid())
  memberId         String
  nurseryId        String?
  activityType     ActivityType
  description      String          // e.g. "Potted 200 Bamboo seedlings", "Attended AGM"
  quantity         Int?            // e.g. 200 seedlings, 5 trees planted, 4 hours worked
  hoursWorked      Float?          // Labor time tracking
  earningsKes      Float           @default(0) // Stipend / bounty earned for activity
  verifiedBy       String?         // Chairman or Secretary ID who verified activity
  status           ActivityStatus  @default(PENDING_VERIFICATION)
  timestamp        DateTime        @default(now())

  member           TreePlanter     @relation(fields: [memberId], references: [id])

  @@index([memberId])
  @@index([activityType])
  @@map("member_activity_logs")
}

enum ActivityType {
  SEED_POTTING           // Potting seeds in nursery
  NURSERY_MAINTENANCE    // Watering, weeding, soil preparation
  TREE_PLANTING          // Planting saplings in the field
  SURVIVAL_INSPECTION    // Inspecting 6-month / 1-year tree growth
  MEETING_ATTENDANCE     // Attending CBO monthly governance meeting
  FINANCIAL_AUDIT        // Financial review by Treasurer / Auditor
}

enum ActivityStatus {
  PENDING_VERIFICATION
  APPROVED
  PAID
  REJECTED
}
```

---

### B. Member Activity Tracking Matrix

Every action performed on the ground is logged into `MemberActivityLog` to compute member performance scores and transparent earnings distribution:

| Role | Primary Activities Tracked | Automatic Calculation Output |
|---|---|---|
| **Nursery Value Creator** | Seed potting, soil bag preparation, seedling watering | `Total Seedlings Produced`, `Nursery Stipend Earned` |
| **Field Planter** | Sapling transport, geotagged digging & planting | `Trees Planted`, `Survival Score %`, `Planting Bounty` |
| **Secretary** | AGM attendance logging, new member registration | `Meeting Quorum Audit`, `Member Engagement Index` |
| **Treasurer** | Revenue disbursement, Paystack/M-Pesa payout approval | `Group Financial Audit Log`, `Fund Distribution %` |
| **Chairman & Vice Chair** | Final sign-off on batch dispatches & bounty releases | `Governance Authorization Audit Trail` |

---

### C. Sample Queries for Activity & Investor Tracking

#### 1. Calculate a Member's Monthly Contribution & Earnings
```ts
import { prisma } from "@/lib/prisma";

const memberStats = await prisma.memberActivityLog.aggregate({
  where: {
    memberId: "planter_123",
    status: "APPROVED",
    timestamp: { gte: new Date("2026-08-01") },
  },
  _sum: {
    quantity: true,
    hoursWorked: true,
    earningsKes: true,
  },
});

console.log(`Total Work: ${memberStats._sum.quantity} units, ${memberStats._sum.hoursWorked} hrs`);
console.log(`Total Payout Due: KES ${memberStats._sum.earningsKes}`);
```

#### 2. Impact Investor Dashboard Portfolio Query
```ts
const investorPortfolio = await prisma.impactInvestor.findUnique({
  where: { id: "investor_456" },
  include: {
    sponsorships: {
      include: {
        nursery: {
          select: {
            name: true,
            seedlingBatches: { select: { quantityReady: true } },
          },
        },
      },
    },
  },
});
```

---

## 9. Task Management, Initiatives & Rich Metadata Capture Engine

Trees are not planted in isolation — they belong to specific **Initiatives / Campaigns** and are executed via **Field Tasks** with rich environmental metadata.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   🎯 Initiative / Restoration Campaign                  │
│       (e.g., "Kipkelion Riparian Corridor & Erosion Control 2026")     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Creates Tasks
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        📋 Field Work Task                              │
│       (e.g., "Plant 200 Prunus Africana at Zone B — Bounty: 10,000 KES")│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Executed By Member
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   🌳 Geotagged Planted Tree (Rich Metadata)            │
│   Soil Type · Slope · Weather · Objective · Audio Proof · Land Tenure  │
└────────────────────────────────────────────────────────────────────────┘
```

### A. Extended Prisma Models (Initiatives, Tasks & Rich Metadata)

Add these models to `prisma/schema.prisma`:

```prisma
// ============================================================================
// 10. CAMPAIGNS & INITIATIVES
// ============================================================================
model Initiative {
  id               String            @id @default(cuid())
  code             String            @unique // e.g. "INIT-2026-RIVER-MAU"
  name             String            // e.g. "Mara River Buffer Protection Project"
  description      String            // Detailed project narrative & goals
  primaryObjective InitiativePurpose @default(RIPARIAN_RESTORATION)
  
  // Targets & Budget
  targetTreeCount  Int
  plantedTreeCount Int               @default(0)
  budgetKes        Float
  startDate        DateTime
  endDate          DateTime?
  status           InitiativeStatus  @default(ACTIVE)
  
  sponsorId        String?           // Impact Investor / Funder ID
  sponsor          ImpactInvestor?   @relation(fields: [sponsorId], references: [id])
  
  tasks            Task[]
  plantedTrees     PlantedTree[]

  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  @@map("initiatives")
}

enum InitiativePurpose {
  RIPARIAN_RESTORATION    // Riverbank & wetland protection
  SOIL_EROSION_CONTROL     // Steep slope stabilization
  BIODIVERSITY_CORRIDOR    // Wildlife habitat connection
  AGROFORESTRY_COMMUNITY  // Shade trees & fruit trees for smallholders
  CARBON_SEQUESTRATION     // High-density carbon sink
  COMMERCIAL_TIMBER_DEFI   // Sustainable timber rotation
}

enum InitiativeStatus {
  PLANNING
  ACTIVE
  COMPLETED
  PAUSED
}

// ============================================================================
// 11. TASK MANAGEMENT ENGINE
// ============================================================================
model Task {
  id               String          @id @default(cuid())
  taskNumber       String          @unique // e.g. "TASK-2026-0092"
  title            String          // e.g. "Plant 150 Bamboo along Zone C Riverbank"
  description      String          // Specific work instructions & tools required
  taskType         TaskType        @default(TREE_PLANTING)
  
  initiativeId     String?
  nurseryId        String?
  assignedMemberId String?         // Member assigned to complete task
  
  // Task Conditions & Bounty
  targetQuantity   Int             // Target trees / seedlings / hours
  completedQuantity Int            @default(0)
  bountyRewardKes  Float           @default(0) // Total payout upon completion & verification
  deadline         DateTime
  status           TaskStatus      @default(OPEN)
  proofIpfsHash    String?         // Geotagged completion proof bundle

  initiative       Initiative?     @relation(fields: [initiativeId], references: [id])
  nursery          NurseryGroup?   @relation(fields: [nurseryId], references: [id])
  assignedMember   TreePlanter?    @relation(fields: [assignedMemberId], references: [id])

  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  @@index([initiativeId])
  @@index([status])
  @@map("tasks")
}

enum TaskType {
  SEEDLING_POTTING
  NURSERY_WATERING
  BATCH_TRANSPORT
  TREE_PLANTING
  SURVIVAL_AUDIT
  WEEDING_PRUNING
}

enum TaskStatus {
  OPEN                // Available for members to claim
  ASSIGNED            // Claimed by a member
  IN_PROGRESS         // Work being recorded
  SUBMITTED_FOR_REVIEW// Awaiting leader/auditor sign-off
  VERIFIED_COMPLETED  // Approved & bounty paid
  CANCELLED
}
```

---

### B. Updated `PlantedTree` Schema with Rich Metadata Capture

```prisma
// Extended PlantedTree model with Initiative link and Rich Environmental Metadata
model PlantedTree {
  id               String          @id @default(cuid())
  treeTagId        String          @unique // e.g. "KAI-TREE-2026-8849"
  batchId          String
  initiativeId     String?         // Belongs to Initiative / Campaign
  taskId           String?         // Completed as part of Task
  planterId        String
  species          String
  
  // Precise Geotagging
  gpsLatitude      Float
  gpsLongitude     Float
  altitudeMeters   Float?
  
  // Contextual "Why & How" Metadata
  plantingPurpose  String          // Narrative reason e.g. "Riverbank stabilization to prevent siltation"
  landTenure       LandTenureType  @default(COMMUNITY_PROTECTED)
  
  // Rich Environmental Metadata (JSON Blob)
  // Captures: { soilType, slopePercent, weatherOnPlantingDay, fertilizerType, companionPlants, audioNoteIpfsHash }
  richMetadata     Json?
  
  photoIpfsHash    String          // Geotagged photo proof on IPFS
  healthStatus     TreeHealth      @default(ALIVE_HEALTHY)
  datePlanted      DateTime        @default(now())
  
  batch            SeedlingBatch   @relation(fields: [batchId], references: [id])
  initiative       Initiative?     @relation(fields: [initiativeId], references: [id])
  planter          TreePlanter     @relation(fields: [planterId], references: [id])
  inspections      TreeInspection[]

  @@index([initiativeId])
  @@index([gpsLatitude, gpsLongitude])
  @@map("planted_trees")
}

enum LandTenureType {
  COMMUNITY_PROTECTED
  PUBLIC_FOREST_RESERVE
  PRIVATE_SMALLHOLDER
  SCHOOL_OR_INSTITUTIONAL
}
```

---

### C. Sample Geotag Payload with Rich Metadata (`POST /api/trees/plant`)

When a planter submits a tree, the PWA captures environmental context:

```json
{
  "treeTagId": "KAI-TREE-2026-9921",
  "initiativeId": "clx_initiative_mau_river",
  "taskId": "TASK-2026-0092",
  "batchId": "clx_batch_bamboo_04",
  "planterId": "clx_member_joseph",
  "species": "Dendrocalamus asper (Giant Bamboo)",
  "gpsLatitude": -0.51234,
  "gpsLongitude": 35.78912,
  "altitudeMeters": 2180.5,
  "plantingPurpose": "Riverbank siltation control along Mara River tributary",
  "landTenure": "COMMUNITY_PROTECTED",
  "richMetadata": {
    "soilType": "Volcanic Loam",
    "slopePercent": 18.5,
    "weatherOnPlantingDay": "Light Rain / Overcast",
    "plantingMethod": "Pitted with organic compost",
    "fertilizerType": "Organic Biochar Compost",
    "companionPlants": ["Vetiver Grass"],
    "audioNoteIpfsHash": "ipfs://bafybeiaudio123...",
    "photoExif": {
      "cameraModel": "Galaxy A14",
      "captureTime": "2026-09-01T02:30:00Z"
    }
  },
  "photoIpfsHash": "ipfs://bafybeiphoto456..."
}
```



