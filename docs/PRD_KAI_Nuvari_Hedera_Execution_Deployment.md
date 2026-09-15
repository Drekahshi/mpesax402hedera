# KAI Nuvari — Hedera Execution, Token Economy, NFT & HashPack Deployment PRD

**Product:** KAI Nuvari  
**Application:** Next.js + TypeScript  
**Primary Blockchain:** Hedera  
**Wallet:** HashPack  
**Payment Protocol:** X402  
**Document Purpose:** Complete implementation brief for the next application build/rebuild.

---

## 1. Product Objective

Transform KAI Nuvari from a UI/prototype experience into a functional Hedera-based financial execution platform.

The application must allow users to:

- Build policies.
- Validate policies.
- Execute policies on Hedera.
- Execute financial products such as **KaiTrust**, **Kai Pension**, and **Money Market Fund**.
- Swap HBAR for KAI ecosystem tokens.
- Mint KAI ecosystem tokens.
- Use X402 for execution/payment flows.
- Connect and authorize transactions through **HashPack**.
- Receive real on-chain transaction confirmations.
- Interact with deployed KAI NFTs.
- View real Hedera Token IDs and transaction IDs.

### Core Principle

> **If the UI says "Execute," something real must happen on Hedera.**

The system must not use fake transaction confirmations or simulated balances for production functionality.

---

## 2. Application Stack

The application is a **Next.js + TypeScript** application.

### Requirements

- Next.js App Router
- TypeScript throughout
- Hedera SDK integration (server-side)
- Server-side execution for all sensitive operations
- HashPack wallet integration (client-side)
- X402 payment integration
- Hedera Token Service (HTS) for fungible tokens & NFTs
- Environment-based network configuration (testnet / mainnet)
- Server-side protection of signing credentials
- Real Hedera transaction IDs returned on every execution
- **No private keys ever exposed to the frontend**

---

## 3. Playground

### 3.1 Remove KAIWAX Branding

The current Playground displays **KAIWAX** branding.

**Required change:**
- Remove all KAIWAX branding from the Playground.
- Replace with KAI Nuvari branding.
- Search the entire UI for any remaining KAIWAX references and remove/replace them.

### 3.2 Policy Execution — Required Behavior

Every executable policy must follow this state machine:

```
Create Policy
      ↓
Validate Policy
      ↓
Check Authorization
      ↓
Calculate Required Fee
      ↓
X402 Payment / Fee Flow
      ↓
User Approval
      ↓
Hedera Transaction
      ↓
Wait for Confirmation
      ↓
Policy Executed (Confirmed ✓ | Failed ✕)
```

### Policy UI States

The UI must expose clear execution states:

| State | Description |
|---|---|
| `Draft` | Policy created, not yet submitted |
| `Validating` | Parameters being checked |
| `Awaiting Payment` | X402 fee flow initiated |
| `Awaiting Approval` | Waiting for user wallet sign |
| `Executing` | Transaction submitted to Hedera |
| `Confirmed` | Hedera confirmed the tx |
| `Failed` | Execution failed — reason shown |

### 3.3 Hedera Execution Handler

Every executable policy must have a real Hedera execution handler that:

1. Receives the policy.
2. Validates policy parameters.
3. Validates user authorization.
4. Determines required execution fee.
5. Initiates X402 where required.
6. Requests user wallet approval.
7. Submits the appropriate Hedera transaction.
8. Waits for confirmation.
9. Returns the Hedera transaction ID.
10. Displays the result to the user.

> **If execution fails, show the actual failure reason — never swallow errors silently.**

---

## 4. X402 Integration

X402 is the payment mechanism for execution-related services.

### 4.1 Payment Flow

```
User requests execution
        ↓
Policy/Agent determines required fee
        ↓
X402 payment request generated
        ↓
User reviews fee (what, how much, what for)
        ↓
User authorizes
        ↓
Payment verified
        ↓
Hedera execution
        ↓
Transaction confirmed
```

### 4.2 User Transparency

At the X402 step, the user must always see:
- **What** they are paying for.
- **How much** is required.
- **Payment status** (pending / verified / failed).
- **Execution status** after payment.
- **Final Hedera transaction ID**.

### 4.3 No Silent Execution

The application must **not** silently execute financial actions on behalf of the user.

Required authorization flow:

```
Agent proposes action
        ↓
User approves (explicit confirmation)
        ↓
X402 payment
        ↓
Hedera transaction
```

---

## 5. Securities / Financial Products

The Securities section currently has selectable products that do not execute. These must become functional.

### 5.1 Initial Products

- KaiTrust
- Kai Pension
- Money Market Fund
- Any other securities/policy products already present in the application

### 5.2 Execution Flow Per Product

```
Select Product
      ↓
View Product Details
      ↓
Configure Investment / Action
      ↓
Validate Parameters
      ↓
Authorize
      ↓
Pay Required Fee (X402)
      ↓
Execute on Hedera
      ↓
Confirmation (TX ID shown)
```

Each product needs a **real execution handler**, not a placeholder button.

---

## 6. Swap Engine

### 6.1 Initial Reference Rates

| From | To | Rate |
|---|---|---|
| 1 HBAR | Y Token | 10 Y |
| 1 HBAR | KAI Cents | 1,000 KAI Cents |
| Other tokens | Variable | Configurable |

### 6.2 Configurable Rate Architecture

Do **not** permanently hard-code all exchange rates in the frontend.

```
Token Config
  ↓
Reference Rate (base)
  ↓
Current Rate (adjustable)
  ↓
Fee / Slippage
  ↓
Expected Output (shown to user)
  ↓
User Approval
  ↓
Swap Execution
  ↓
Hedera Transaction + TX ID
```

The architecture must support adding new tokens and updating rates later without a frontend redeploy.

### 6.3 Swap UI Requirements

Each swap must display:
- Input token and amount
- Output token and expected amount
- Current exchange rate
- Fees / slippage (if applicable)
- Confirmation button (no silent execution)
- Hedera transaction ID after execution
- Updated balance after confirmation

### 6.4 Swap API Endpoints

```
POST /api/swap/quote
POST /api/swap/execute
```

Quote response:
```json
{
  "inputToken": "HBAR",
  "inputAmount": "1",
  "outputToken": "Y",
  "rate": "10",
  "expectedOutput": "10",
  "fee": "...",
  "slippage": "..."
}
```

Execution must require authorization and return the actual Hedera transaction ID.

---

## 7. KAI Ecosystem Token Minting

### 7.1 Minimum Initial Mint Requirements

| Token | Minimum Initial Mint |
|---|---|
| Y Token | 100,000 |
| KAI Cents | 100,000 |
| Y Gold | 100,000 |
| GAMI | 100,000 |
| NVR | 100,000 |
| Any other KAI ecosystem token | 100,000 minimum |

These are the minimum initial mint requirements for this build. No ecosystem token may be initialized below 100,000 units.

### 7.2 Required Token Records

For each token, record:

| Field | Description |
|---|---|
| Token Name | Full display name |
| Symbol | Ticker |
| Decimals | Decimal places |
| Initial Supply | Amount minted at launch |
| Treasury Account | Hedera account holding treasury |
| Mint Authority | Account authorized to mint |
| Total Supply | Current total supply |
| Hedera Token ID | `0.0.XXXXX` — real ID after deployment |
| Mint Transaction ID | Hedera TX ID of the mint transaction |
| Network | testnet / mainnet |
| Deployment Status | deployed / pending |

Every mint must be backed by a real Hedera transaction.

### 7.3 Token Mint API

```
POST /api/tokens/mint
```

Backend must validate:
- Token ID / token configuration
- Mint authority
- Amount (≥ 100,000 minimum for initial mint)
- Destination account
- Authorization

Then submit the actual Hedera mint transaction and return the TX ID.

---

## 8. Token Architecture

Maintain a clear distinction between:

### Native / Network Assets
- HBAR
- Other supported native Hedera assets

### KAI Ecosystem Tokens (HTS)
- Y Token
- Y Gold
- KAI Cents
- GAMI
- NVR
- Other approved KAI assets

Each token must have a real Hedera Token ID. Tokens must **not** be represented only as frontend balances.

---

## 9. NFT Deployment

All KAI Nuvari NFTs required by the application must be actually deployed and minted on Hedera. They must not exist only as mock assets in the frontend.

This includes conservation/impact NFT components and any other NFT collections currently implemented.

### 9.1 NFT Deployment Flow

```
NFT Collection Configuration
        ↓
Create Hedera NFT Token (HTS)
        ↓
Configure Treasury / Supply
        ↓
Associate Required Accounts
        ↓
Mint NFT(s)
        ↓
Attach / Register Metadata
        ↓
Verify on Hedera Mirror Node
        ↓
Record Token ID
        ↓
Record Transaction ID
        ↓
Add to Deployment Registry
        ↓
Connect to Next.js Application
```

### 9.2 NFT Record Fields

For every NFT collection/token, record:

| Field | Description |
|---|---|
| NFT Name | Display name |
| Symbol | Ticker/symbol |
| Description | Brief description |
| Hedera Token ID | `0.0.XXXXX` |
| Serial Numbers | Minted serial(s) where applicable |
| Treasury Account | Holding account |
| Metadata Reference | IPFS / CDN URI |
| Mint Transaction ID | Hedera TX ID |
| Deployment Timestamp | ISO 8601 datetime |
| Network | testnet / mainnet |
| Status | deployed / pending |

---

## 10. NFT Token ID Registry

After deployment, create a dedicated deployment folder containing all deployed Token IDs.

### Required Structure

```
/deployment
  /hedera
    /nfts
      token-ids.json
      token-ids.md
      deployment-summary.json
```

### `token-ids.json` Format

```json
{
  "network": "hedera-testnet",
  "deployedAt": "2025-01-01T00:00:00Z",
  "nfts": {
    "kaiConservation": {
      "name": "KAI Conservation NFT",
      "symbol": "KAICONS",
      "tokenId": "0.0.XXXXX",
      "mintTxId": "0.0.XXXXX@XXXXXXXXXX",
      "type": "NFT",
      "status": "deployed"
    },
    "treeImpact": {
      "name": "KAI Tree Impact NFT",
      "symbol": "KAITREE",
      "tokenId": "0.0.XXXXX",
      "mintTxId": "0.0.XXXXX@XXXXXXXXXX",
      "type": "NFT",
      "status": "deployed"
    }
  }
}
```

> **Do not commit placeholder IDs as deployed assets. Populate only after real deployment.**

---

## 11. HashPack Integration

HashPack is the primary user wallet/authorization interface for all Hedera interactions.

### 11.1 Required Capabilities

Users must be able to:

- Connect HashPack.
- View their HBAR balance.
- View supported KAI token balances.
- View supported NFTs in their wallet.
- Approve proposed transactions.
- Execute swaps.
- Execute policies.
- Execute supported financial product actions.
- Receive NFT transfers.
- See real Hedera transaction confirmations.

### 11.2 Security

- The application must **never** request, store, or expose a user's HashPack private key.
- User-controlled transactions must be signed through the user's own HashPack wallet.
- Only operator/treasury signing (server-side) may use server-held credentials.

---

## 12. HashPack Deployment Package

The project must include a clean deployment package that makes all deployed Hedera assets easy to identify and use.

### Required Deployment Folder Structure

```
/deployment
  README.md

  /hedera
    network.json

    /nfts
      token-ids.json
      token-ids.md
      deployment-summary.json

    /tokens
      token-ids.json

    /contracts
      contract-ids.json

    /transactions
      deployment-transactions.json
```

### `network.json` Format

```json
{
  "network": "hedera-testnet",
  "chainId": "296",
  "mirrorNode": "https://testnet.mirrornode.hedera.com",
  "hashScan": "https://hashscan.io/testnet",
  "rpcUrl": "https://testnet.hashio.io/api"
}
```

---

## 13. Deployment Registry

For every deployed asset, record:

| Asset | Type | Network | Token/Contract ID | Transaction ID | Status |
|---|---|---|---|---|---|
| Y Token | HTS Fungible | Hedera | 0.0.XXXXX | ... | Deployed |
| KAI Cents | HTS Fungible | Hedera | 0.0.XXXXX | ... | Deployed |
| Y Gold | HTS Fungible | Hedera | 0.0.XXXXX | ... | Deployed |
| GAMI | HTS Fungible | Hedera | 0.0.XXXXX | ... | Deployed |
| NVR | HTS Fungible | Hedera | 0.0.XXXXX | ... | Deployed |
| Conservation NFT | HTS NFT | Hedera | 0.0.XXXXX | ... | Deployed |
| Tree Impact NFT | HTS NFT | Hedera | 0.0.XXXXX | ... | Deployed |

The final registry must contain **real IDs** — no placeholders allowed in production.

---

## 14. Transaction Confirmation UX

Every successful on-chain action must display a confirmation.

### Success Confirmation

```
✓ Transaction Successful

Action:      Swap HBAR → Y Token
Amount:      1 HBAR → 10 Y
Network:     Hedera
Transaction ID: 0.0.xxxxx@xxxxxxxxx
Status:      Confirmed
```

### Failure Confirmation

```
✕ Transaction Failed

Reason: Insufficient balance

No funds were moved.
```

> **The application must never report success before the transaction is confirmed on Hedera.**

---

## 15. Policy Execution API

```
POST /api/policies/execute
```

**Request:**
```json
{
  "policyId": "...",
  "userId": "...",
  "action": "...",
  "parameters": {}
}
```

**Response:**
```json
{
  "status": "confirmed",
  "transactionId": "0.0.xxxxx@xxxxxxxxx",
  "network": "hedera",
  "action": "...",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

The execution contract must always return a real transaction status and Hedera transaction ID.

---

## 16. Security Requirements

The system must:

- ✅ Never expose private keys to the frontend.
- ✅ Never store or request HashPack private keys.
- ✅ Keep server-side signing credentials protected.
- ✅ Prefer user wallet signing (HashPack) for user-controlled funds.
- ✅ Require explicit authorization for user-controlled financial actions.
- ✅ Validate policy parameters server-side.
- ✅ Validate all token IDs.
- ✅ Prevent unauthorized minting.
- ✅ Prevent replayed execution requests (idempotency).
- ✅ Log all execution attempts.
- ✅ Log all successful transactions.
- ✅ Log all failed transactions.
- ✅ Never report success before Hedera confirmation.
- ✅ Separate testnet and production credentials via environment variables.
- ✅ Keep all secrets in environment variables / secrets management — never in source code.

---

## 17. Full Repository Deliverable Structure

```
KAI-Nuvari/
│
├── app/                        # Next.js App Router pages
├── components/                 # Shared UI components
├── lib/                        # Hedera SDK, X402, HashPack utilities
├── contracts/                  # Smart contracts (if applicable)
├── public/                     # Static assets
│
├── deployment/
│   ├── README.md               # Deployment guide
│   │
│   └── hedera/
│       ├── network.json        # Network config (testnet/mainnet)
│       │
│       ├── nfts/
│       │   ├── token-ids.json
│       │   ├── token-ids.md
│       │   └── deployment-summary.json
│       │
│       ├── tokens/
│       │   └── token-ids.json
│       │
│       ├── contracts/
│       │   └── contract-ids.json
│       │
│       └── transactions/
│           └── deployment-transactions.json
│
├── .env.example
├── package.json
└── README.md
```

---

## 18. Definition of Done

### ✅ Playground

A tester can:
1. Open the Playground.
2. Confirm KAIWAX branding is **removed**.
3. Build a policy.
4. Validate the policy.
5. Authorize execution.
6. Pay the required fee through X402.
7. Execute the policy on Hedera.
8. See a **real** transaction confirmation.
9. See the **real** Hedera transaction ID.

### ✅ Securities

A tester can execute each of:
- KaiTrust
- Kai Pension
- Money Market Fund
- Other supported securities

Each execution must produce a **real Hedera result**.

### ✅ Swaps

A tester can execute:
- `1 HBAR → 10 Y`
- `1 HBAR → 1,000 KAI Cents`

Rates must come from the **configurable rate engine**.

### ✅ Tokens

Every required KAI ecosystem token has:
- Initial mint of **≥ 100,000 tokens**
- A real Hedera Token ID in the deployment registry
- A real mint transaction ID

### ✅ NFTs

Every required NFT collection is:
- Deployed and minted on Hedera
- Listed in `/deployment/hedera/nfts/token-ids.json`
- Complete with real Token IDs, transaction IDs, and metadata references

### ✅ HashPack

A user can:
- Connect HashPack.
- View HBAR balance.
- View KAI token balances.
- View supported NFTs.
- Approve transactions.
- Execute supported actions.
- See confirmed Hedera transactions.

### ✅ X402

A tester can:
1. Trigger an action requiring payment.
2. Receive the X402 payment request.
3. Review the fee.
4. Authorize payment.
5. Complete payment.
6. Proceed to Hedera execution.
7. Receive the final transaction confirmation.

---

## 19. Priority Order

### P0 — Critical (Must Have)
- [ ] Remove KAIWAX branding everywhere.
- [ ] Make Playground policies executable on Hedera.
- [ ] Build Hedera execution engine (server-side).
- [ ] Make KaiTrust executable.
- [ ] Make Kai Pension executable.
- [ ] Make Money Market Fund executable.
- [ ] Integrate X402 execution/payment flow.
- [ ] Implement real transaction confirmation UI.
- [ ] Integrate HashPack wallet authorization.

### P1 — Core Token Economy
- [ ] Build configurable swap engine (rate config).
- [ ] Set initial rate: 1 HBAR = 10 Y.
- [ ] Set initial rate: 1 HBAR = 1,000 KAI Cents.
- [ ] Make other token rates configurable.
- [ ] Mint ≥ 100,000 of every required ecosystem token.
- [ ] Record all Token IDs in deployment registry.

### P1 — NFT Infrastructure
- [ ] Deploy all required NFT collections on Hedera.
- [ ] Mint required NFTs.
- [ ] Record every NFT Token ID.
- [ ] Record every NFT mint transaction ID.
- [ ] Store records in `/deployment/hedera/nfts/`.

### P2 — Production Hardening
- [ ] Strengthen authorization/security layer.
- [ ] Add transaction history view.
- [ ] Add failure/retry handling.
- [ ] Add execution audit logs.
- [ ] Improve policy validation.
- [ ] Add deployment verification tooling.
- [ ] Add monitoring and error reporting.

---

## 20. Final Developer Deliverable

The completed application must be a functional **Next.js + TypeScript** KAI Nuvari application running on Hedera, with:

| Requirement | Status |
|---|---|
| Executable policies | Required |
| Executable KaiTrust | Required |
| Executable Kai Pension | Required |
| Executable Money Market Fund | Required |
| X402 payment/execution flow | Required |
| HashPack wallet integration | Required |
| Configurable HBAR/token swap rates | Required |
| 1 HBAR = 10 Y reference rate | Required |
| 1 HBAR = 1,000 KAI Cents reference rate | Required |
| ≥ 100,000 initial mint per ecosystem token | Required |
| Real KAI token deployments | Required |
| Real NFT deployments on Hedera | Required |
| Real Hedera Token IDs | Required |
| Real Hedera transaction IDs | Required |
| NFT Token IDs in `/deployment/` folder | Required |
| Deployment records ready for HashPack | Required |
| No fake/simulated transaction confirmations | Required |
| No placeholder production asset IDs | Required |
| No private keys exposed to frontend | Required |

---

## Final Product Principle

> KAI Nuvari should not just demonstrate what a Hedera financial platform *could* do.  
> The application should **actually execute** authorized financial, token, and NFT actions on Hedera —  
> with X402 handling the payment layer and HashPack handling user authorization.
