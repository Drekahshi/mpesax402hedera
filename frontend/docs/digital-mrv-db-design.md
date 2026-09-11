# Digital MRV (dMRV) Decentralized Database Specification
## For Community Forest User Groups (CFUGs)

> **System Purpose:** A decentralized Measurement, Reporting, and Verification (MRV) database architecture designed to capture, verify, and monetize community forest conservation data on Ethereum & Hedera (X402).

---

## 1. System Architecture Overview

```mermaid
flowchart TD
    subgraph Data Capture Layer
        A1[🌲 Patrol Officers / Guardians Mobile App]
        A2[🛰️ Satellite Imagery / Sentinel API]
        A3[📡 IoT Acoustic & Soil Sensors]
    end

    subgraph Decentralized Storage & Query Layer
        B1[🐘 Neon Postgres / Ceramic Network<br/>Indexed Query Engine]
        B2[📦 IPFS / Arweave<br/>Immutable Storage: Images, LiDAR, Raw Logs]
    end

    subgraph Verification & Logic Layer
        C1[🤖 AI Satellite Canopy Analysis]
        C2[🕵️ Certified Auditor Sign-off DID]
    end

    subgraph On-Chain Execution Layer (Ethereum & Hedera)
        D1[📜 Conservation NFT / Carbon Registry Contract]
        D2[💰 Automated Paystack / Stablecoin Reward Payouts]
    end

    A1 & A2 & A3 --> B1 & B2
    B1 & B2 --> C1 & C2
    C1 & C2 -->|Verified Proof| D1
    D1 -->|Yield / Royalty| D2
```

---

## 2. Relational Schema (Prisma / Postgres)

This database structure captures structured telemetry and metadata indexed from on-chain logs and IPFS payloads.

```prisma
// ==========================================
// 1. COMMUNITY FOREST USER GROUP (CFUG)
// ==========================================
model CommunityForest {
  id             String        @id @default(cuid())
  name           String        // e.g. "Mau Forest Guardians Group A"
  did            String        @unique // W3C Decentralized Identifier
  locationRegion String        // e.g. "Rift Valley, Kenya"
  boundaryGeoJson Json         // Polygon GIS coordinates defining the forest area
  establishedAt  DateTime
  treasuryWallet String        // On-chain wallet address receiving carbon payouts
  members        ForestMember[]
  zones          ForestZone[]
  createdAt      DateTime      @default(now())

  @@map("cfug_groups")
}

// ==========================================
// 2. GUARDIAN / MEMBER PROFILES
// ==========================================
model ForestMember {
  id           String          @id @default(cuid())
  cfugId       String
  name         String
  role         MemberRole      @default(GUARDIAN) // GUARDIAN, AUDITOR, ADMIN
  wallet       String          @unique
  phoneNumber  String?         // For M-Pesa / Paystack payouts
  patrolLogs   PatrolLog[]
  cfug         CommunityForest @relation(fields: [cfugId], references: [id])

  @@map("cfug_members")
}

enum MemberRole {
  GUARDIAN
  AUDITOR
  COMMUNITY_LEADER
}

// ==========================================
// 3. FOREST ZONES & CARBON POOLS
// ==========================================
model ForestZone {
  id               String            @id @default(cuid())
  cfugId           String
  zoneCode         String            // e.g. "ZONE-ALPHA-01"
  areaHectares     Float
  targetSpecies    String[]          // Primary indigenous tree species
  baselineCarbon   Float             // Baseline tCO2e (tonnes of CO2 equivalent)
  currentCarbon    Float             // Current estimated tCO2e
  cfug             CommunityForest   @relation(fields: [cfugId], references: [id])
  patrolLogs       PatrolLog[]
  satelliteScans   SatelliteScan[]
  verifications    VerificationAudit[]

  @@map("forest_zones")
}

// ==========================================
// 4. PATROL GROUND LOGS (MEASUREMENT)
// ==========================================
model PatrolLog {
  id             String      @id @default(cuid())
  zoneId         String
  guardianId     String
  timestamp      DateTime    @default(now())
  gpsLatitude    Float
  gpsLongitude   Float
  treesCounted   Int
  avgDiameterCm  Float       // Tree DBH (Diameter at Breast Height)
  healthStatus   String      // "HEALTHY", "DEFORESTATION_RISK", "FIRE_DAMAGE"
  ipfsPhotoHash  String      // IPFS URI containing encrypted geotagged photo proof
  rawLogIpfsHash String      // IPFS URI containing complete JSON telemetry
  zone           ForestZone   @relation(fields: [zoneId], references: [id])
  guardian       ForestMember @relation(fields: [guardianId], references: [id])

  @@index([timestamp])
  @@map("patrol_logs")
}

// ==========================================
// 5. REMOTE SENSING DATA (MEASUREMENT)
// ==========================================
model SatelliteScan {
  id               String     @id @default(cuid())
  zoneId           String
  scanDate         DateTime
  ndviIndex        Float      // Normalized Difference Vegetation Index (0.0 - 1.0)
  canopyCoverPct   Float      // Estimated % forest canopy cover
  satelliteProvider String    // e.g. "Sentinel-2", "PlanetLabs"
  imageIpfsHash    String     // High-resolution satellite raster metadata
  zone             ForestZone @relation(fields: [zoneId], references: [id])

  @@map("satellite_scans")
}

// ==========================================
// 6. AUDIT & VERIFICATION LOGS (VERIFICATION)
// ==========================================
model VerificationAudit {
  id                  String             @id @default(cuid())
  zoneId              String
  auditorDid          String             // Verifier's Decentralized ID
  status              AuditStatus        @default(PENDING)
  calculatedCarbonTons Float             // Calculated carbon offset credit
  proofHash           String             // Cryptographic zero-knowledge / Merkle proof hash
  txHash              String?            // On-chain Ethereum & Hedera transaction hash
  reviewedAt          DateTime?
  zone                ForestZone         @relation(fields: [zoneId], references: [id])
  carbonIssuance      CarbonIssuance?

  @@map("verification_audits")
}

enum AuditStatus {
  PENDING
  APPROVED
  REJECTED
}

// ==========================================
// 7. CARBON CREDIT & INCENTIVE PAYOUTS
// ==========================================
model CarbonIssuance {
  id              String            @id @default(cuid())
  auditId         String            @unique
  nftTokenId      String            // Ethereum & Hedera ERC-721 / ERC-1155 Token ID
  tokensMinted    Float             // Total yBOB or Carbon Tokens minted
  payoutAmountKes Float             // Converted fiat equivalent paid to CFUG
  payoutTxRef     String            // Paystack / On-chain payment reference
  issuedAt        DateTime          @default(now())
  audit           VerificationAudit @relation(fields: [auditId], references: [id])

  @@map("carbon_issuances")
}
```

---

## 3. IPFS Off-Chain JSON Schema Standard

Raw high-volume telemetry (geotagged images, audio recordings from acoustic sensors, sensor logs) is stored on IPFS. The IPFS content identifier (`CID`) is stored in the database.

### Geotagged Patrol Record Payload (`patrol_log.json`):

```json
{
  "$schema": "https://kai-protocol.org/schemas/mrv-patrol-v1.json",
  "cfug_did": "did:kai:cfug:mau-group-a",
  "zone_code": "ZONE-ALPHA-01",
  "telemetry": {
    "timestamp": "2026-09-01T02:00:00Z",
    "coordinates": {
      "latitude": -0.4523,
      "longitude": 35.8921,
      "elevation_m": 2210.5
    },
    "measurements": {
      "tree_count": 45,
      "species": ["Afrocarpus falcatus", "Olea africana"],
      "avg_dbh_cm": 38.4,
      "canopy_density_pct": 82.5
    }
  },
  "media_proofs": [
    {
      "type": "IMAGE",
      "ipfs_cid": "ipfs://bafybeicx34q...",
      "sha256_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "guardian_signature": {
    "signer_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "signature": "0x4f8a91..."
  }
}
```

---

## 4. On-Chain Smart Contract Mapping (Ethereum & Hedera (X402))

When a verification audit is **APPROVED**, the verification contract records an immutable attestation on Ethereum & Hedera:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CommunityForestMRV {
    struct MRVRecord {
        bytes32 zoneId;
        string ipfsProofHash;
        uint256 carbonTonsCalculated;
        uint256 timestamp;
        bool isVerified;
    }

    mapping(bytes32 => MRVRecord[]) public zoneRecords;
    event MRVDataSubmitted(bytes32 indexed zoneId, string ipfsHash, uint256 carbonTons);
    event MRVDataVerified(bytes32 indexed zoneId, uint256 recordIndex, address auditor);

    function submitMRVData(bytes32 zoneId, string memory ipfsHash, uint256 carbonTons) external {
        zoneRecords[zoneId].push(MRVRecord({
            zoneId: zoneId,
            ipfsProofHash: ipfsHash,
            carbonTonsCalculated: carbonTons,
            timestamp: block.timestamp,
            isVerified: false
        }));

        emit MRVDataSubmitted(zoneId, ipfsHash, carbonTons);
    }

    function verifyAndMint(bytes32 zoneId, uint256 recordIndex, address cfugTreasury) external {
        MRVRecord storage record = zoneRecords[zoneId][recordIndex];
        require(!record.isVerified, "Already verified");
        
        record.isVerified = true;
        emit MRVDataVerified(zoneId, recordIndex, msg.sender);

        // Triggers Carbon Token / Royalty distribution to CFUG Treasury
    }
}
```

---

## 5. End-to-End Operational Lifecycle

1. **Capture (M):** Forest Guardians use a mobile pwa to log tree counts, GPS coordinates, and geotagged photos offline.
2. **Sync (R):** When network connectivity is established, photos are uploaded to **IPFS**, and the metadata payload is submitted to **Neon Postgres** via `/api/mrv/submit`.
3. **Analyze & Verify (V):**
   - The AI Agent (`ai-agent/agents/policy_recommender.py`) cross-checks ground patrol logs against Sentinel-2 satellite canopy data.
   - A certified auditor approves the batch.
4. **Monetize & Payout:**
   - Smart contract mints a **Forest Conservation NFT / Token** representing verified carbon stored ($tCO_2e$).
   - Paystack/Stablecoin rail distributes payouts directly to the CFUG treasury or guardian mobile money wallets.
