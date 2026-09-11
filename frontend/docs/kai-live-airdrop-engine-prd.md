# KAI Live Airdrop & Rewards Engine — Technical PRD & Developer Implementation Guide

**Version:** 1.0  
**Target Network:** Ethereum & Hedera (X402) (Primary) / Sepolia / Hedera Testnet Testnet (Development)  
**Smart Contract Standards:** ERC-20 (`NVR`, `YBOB`, `GAMI`, `YTOKEN`), EIP-712 / Merkle Proof Claim Vault  
**Frontend Stack:** Next.js 16 (Turbopack), Wagmi v3, Viem v2, Zustand  
**Backend Stack:** PostgreSQL (Neon DB), Next.js API Routes, Ethers/Viem Admin Wallet Relayer  
**Primary Developers:** Blockchain Engineer, Full-Stack Next.js Engineer  

---

## 1. Executive Summary & Objective

The goal of this initiative is to replace the current mock/in-memory frontend state in the **Mining & Airdrops Desk (`/mine`)** with a **live, secure, and production-ready Ethereum & Hedera Smart Contract Airdrop Engine**.

Users will connect their Web3 wallet (e.g., Web3 Wallet, MetaMask, Coinbase Wallet) and claim real ERC-20 tokens (`NVR`, `YBOB`, `GAMI`, `YTOKEN`) directly on the Ethereum & Hedera (X402) / Sepolia testnet upon completing daily check-ins, tasks, or participating in launchpools.

```
                                  LIVE AIRDROP ARCHITECTURE
                                  

     ┌───────────────────┐               ┌───────────────────┐               ┌───────────────────┐
     │ 👤 User Wallet    │──────────────►│ 🌐 Next.js Frontend│──────────────►│ ⚡ Next.js API    │
     │  (Wagmi / Viem)   │               │   (/app/mine)     │               │   Claim Validator │
     └─────────┬─────────┘               └─────────┬─────────┘               └─────────┬─────────┘
               │                                   │                                   │
               │ Direct Transaction                │ Fetch Merkle                      │ Verify Task &
               │ (ERC-20 / Vault Claim)            │ Proof / EIP712 Sig                │ Generate Signature
               ▼                                   ▼                                   ▼
┌───────────────────────────────┐       ┌───────────────────────────────┐       ┌───────────────────────────────┐
│ 🔺 KAIAirdropVault.sol        │◄──────┤ 🐘 PostgreSQL (Neon DB)       │◄──────┤ 🛡️ Admin Relayer Wallet       │
│   Smart Contract Vault        │       │   Claims & Cooldown Ledger    │       │   (Gasless/Signer Service)    │
└───────────────────────────────┘       └───────────────────────────────┘       └───────────────────────────────┘
```

---

## 2. Core Functional Requirements

### 2.1 Daily Claim (24-Hour Cooldown)
- **Reward:** 10 `NVR` tokens per 24-hour window per unique wallet address.
- **Contract Mechanism:** On-chain mapping `mapping(address => uint256) public lastClaimTimestamp` or Merkle/Signed authorization to prevent Sybil exploits.
- **Cooldown Enforcement:** Frontend displays real-time countdown timer synchronized with on-chain block timestamps.

### 2.2 Task-Based Token Rewards
- Users earn specific ERC-20 tokens by completing ecosystem actions:
  - **Daily Check-in:** `5 NVR`
  - **Policy Exploration:** `2 YBOB`
  - **AI Agent Interaction:** `1 GAMI`
  - **Community Join:** `1 YTOKEN`
- API validates task completion server-side before releasing claims or signing EIP-712 claim permits.

### 2.3 Launchpools & Whitelist Distributions
- Whitelist pools allow users to stake/join pools for batch token distributions (e.g., 500 NVR).
- Implements Merkle Tree validation for gas-efficient whitelist verification on Ethereum & Hedera.

### 2.4 User Token Minting (ERC-20 Factory)
- Enables community leaders/SMEs to deploy custom ERC-20 tokens on Sepolia / Hedera Testnet directly through the UI.

---

## 3. Smart Contract Architecture (`KAIAirdropVault.sol`)

The primary contract is an **OpenZeppelin-based Airdrop Vault** deployed on Ethereum & Hedera (X402) / Sepolia.

### 3.1 Solidity Contract DDL (`contracts/KAIAirdropVault.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract KAIAirdropVault is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;

    // Token mappings
    IERC20 public nvrToken;
    IERC20 public ybobToken;
    IERC20 public gamiToken;
    IERC20 public ytokenToken;

    address public trustedSigner;
    uint256 public constant DAILY_COOLDOWN = 1 days;

    // Track last claim timestamps per user address
    mapping(address => uint256) public lastDailyClaim;
    // Track processed task nonces to prevent replay attacks
    mapping(bytes32 => bool) public processedClaims;

    event DailyClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event TaskRewardClaimed(address indexed user, string taskId, address indexed token, uint256 amount);
    event VaultRefilled(address indexed token, uint256 amount);

    constructor(
        address _nvr,
        address _ybob,
        address _gami,
        address _ytoken,
        address _signer
    ) Ownable(msg.sender) {
        nvrToken = IERC20(_nvr);
        ybobToken = IERC20(_ybob);
        gamiToken = IERC20(_gami);
        ytokenToken = IERC20(_ytoken);
        trustedSigner = _signer;
    }

    /**
     * @dev Claim daily 10 NVR token reward (Direct On-Chain Check)
     */
    function claimDaily() external nonReentrant {
        require(block.timestamp >= lastDailyClaim[msg.sender] + DAILY_COOLDOWN, "Daily claim cooldown active");
        uint256 claimAmount = 10 * 10**18;
        require(nvrToken.balanceOf(address(this)) >= claimAmount, "Vault NVR balance insufficient");

        lastDailyClaim[msg.sender] = block.timestamp;
        require(nvrToken.transfer(msg.sender, claimAmount), "NVR Transfer failed");

        emit DailyClaimed(msg.sender, claimAmount, block.timestamp);
    }

    /**
     * @dev Claim task-specific reward with backend EIP-712 signature verification
     */
    function claimTaskReward(
        string calldata taskId,
        address tokenAddress,
        uint256 amount,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        bytes32 claimId = keccak256(abi.encodePacked(msg.sender, taskId, tokenAddress, amount, nonce));
        require(!processedClaims[claimId], "Task reward already claimed");

        // Verify backend signature
        bytes32 messageHash = MessageHashUtils.toEthSignedMessageHash(claimId);
        require(messageHash.recover(signature) == trustedSigner, "Invalid claim signature");

        processedClaims[claimId] = true;
        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(address(this)) >= amount, "Vault token balance insufficient");
        require(token.transfer(msg.sender, amount), "Token Transfer failed");

        emit TaskRewardClaimed(msg.sender, taskId, tokenAddress, amount);
    }

    function setTrustedSigner(address _signer) external onlyOwner {
        trustedSigner = _signer;
    }

    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }
}
```

---

## 4. Database Schema Extensions (`airdrop_claims`)

To ensure robust analytics, task tracking, and backend signing verification, add the following tables to PostgreSQL (`Neon DB`):

```sql
-- Track user daily check-in claims
CREATE TABLE airdrop_daily_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(128) NOT NULL,
    amount DECIMAL(18, 4) NOT NULL DEFAULT 10.0000,
    tx_hash VARCHAR(128),
    claimed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_daily_claims_wallet ON airdrop_daily_claims(wallet_address, claimed_at DESC);

-- Track completed tasks and signatures
CREATE TABLE user_task_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(128) NOT NULL,
    task_id VARCHAR(100) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    amount DECIMAL(18, 4) NOT NULL,
    nonce BIGINT NOT NULL,
    signature TEXT NOT NULL,
    tx_hash VARCHAR(128),
    status VARCHAR(50) DEFAULT 'SIGNED', -- SIGNED, SUBMITTED, CONFIRMED, FAILED
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(wallet_address, task_id)
);
```

---

## 5. Backend API Endpoints

### 5.1 `POST /api/airdrop/claim-task`
- **Purpose:** Validates server-side that the user completed the requested task, then returns an EIP-712 signature for contract execution.
- **Request Payload:**
  ```json
  {
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "taskId": "explore-policy"
  }
  ```
- **Response Payload:**
  ```json
  {
    "success": true,
    "taskId": "explore-policy",
    "tokenAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "amount": "2000000000000000000",
    "nonce": 1725196800,
    "signature": "0xabc...123"
  }
  ```

---

## 6. Frontend Integration Guide (`frontend/src/app/mine/page.tsx`)

### 6.1 Replacing Mock State with Live Contract Calls

Use Wagmi's `useWriteContract` and `useReadContract` hooks to interact with `KAIAirdropVault`:

```typescript
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';

const VAULT_ABI = [...] as const;
const VAULT_ADDRESS = '0x...';

export default function LiveAirdropComponent() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();

  // Read last claim timestamp from Ethereum & Hedera
  const { data: lastClaim } = useReadContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'lastDailyClaim',
    args: address ? [address] : undefined,
  });

  const handleDailyClaim = async () => {
    if (!isConnected) return;
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'claimDaily',
    });
  };

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  return (
    <button 
      onClick={handleDailyClaim} 
      disabled={isPending || isConfirming}
      className="btn-primary"
    >
      {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Mining on Ethereum & Hedera...' : '🎁 Claim 10 NVR Now'}
    </button>
  );
}
```

---

## 7. Security & Anti-Sybil Policies

1. **EIP-712 / HMAC Signatures:** Task rewards CANNOT be triggered without a server-side verified cryptographic signature.
2. **Replay Protection:** Each `claimId` (`keccak256(user, taskId, token, amount, nonce)`) is stored in contract storage to prevent reuse.
3. **Reentrancy Guard:** OpenZeppelin `ReentrancyGuard` applied on all token distribution methods.
4. **Vault Reserves Management:** Emergency `withdrawTokens` restricted strictly to contract `onlyOwner`.

---

## 8. Implementation Task Checklist

- [ ] **Task 1 (Smart Contracts):** Deploy `KAIAirdropVault.sol` to Sepolia / Hedera Testnet Testnet and fund vault with `NVR`, `YBOB`, `GAMI`, and `YTOKEN`.
- [ ] **Task 2 (Backend API):** Create `/api/airdrop/claim-task` API route in Next.js using Viem to sign claim permits with private key.
- [ ] **Task 3 (Database):** Apply `airdrop_daily_claims` and `user_task_claims` migrations to PostgreSQL.
- [ ] **Task 4 (Frontend UI):** Connect `/app/mine` page buttons to Wagmi `useWriteContract` and update Zustand store upon on-chain transaction confirmation.
- [ ] **Task 5 (Verification):** Test daily claims and task completions on Sepolia / Hedera Testnet testnet explorer (`subnets.eth.network/evm`).
