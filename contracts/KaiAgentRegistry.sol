// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA}   from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712}  from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title KaiAgentRegistry
 * @notice ERC-8004-inspired on-chain agent DID registry for the KAI Nuvari ecosystem.
 *
 * Every KAI AI agent gets a verifiable on-chain identity called an "Agent Passport":
 *   - A unique DID  (did:kai:<chainId>:<address>)
 *   - A set of capabilities (what the agent is allowed to do)
 *   - A spend policy  (daily gas limit, per-tx limit, allowed tokens)
 *   - A trust level   (UNTRUSTED → REGISTERED → VERIFIED → CERTIFIED)
 *   - An owner who can update or revoke
 *
 * Agents sign actions with EIP-712 typed data so every on-chain interaction
 * is attributable and auditable.
 *
 * x402 Integration:
 *   - Facilitators call verifyAgentSignature() before releasing payment
 *   - The escrow contract checks isAgentActive() before settling
 */
contract KaiAgentRegistry is Ownable, EIP712 {
    using ECDSA for bytes32;

    // ── Enums ────────────────────────────────────────────────────────────────
    enum TrustLevel { UNTRUSTED, REGISTERED, VERIFIED, CERTIFIED }

    // ── Structs ──────────────────────────────────────────────────────────────
    struct AgentPassport {
        address agentAddress;    // EOA or smart-account address of the agent
        address owner;           // human/org that controls this agent
        string  did;             // did:kai:<chainId>:<agentAddress>
        string  name;            // human-readable name
        string  description;     // what the agent does
        string  serviceEndpoint; // HTTPS endpoint (for x402 callbacks)
        bytes32 capabilityHash;  // keccak256 of capabilities JSON
        uint256 dailySpendLimit; // max wei per day this agent may spend
        uint256 perTxLimit;      // max wei per single transaction
        TrustLevel trustLevel;
        bool    active;
        uint256 registeredAt;
        uint256 updatedAt;
        uint256 nonce;           // replay-protection nonce
    }

    struct SpendPolicy {
        uint256 dailyLimit;      // wei
        uint256 perTxLimit;      // wei
        address[] allowedTokens; // empty = any token allowed
        bool    requiresEscrow;  // must go through KaiEscrow
    }

    // EIP-712 typehash for agent action credentials
    bytes32 public constant ACTION_TYPEHASH = keccak256(
        "AgentAction(address agent,bytes32 actionId,uint256 value,uint256 nonce,uint256 deadline)"
    );

    // ── Storage ──────────────────────────────────────────────────────────────
    mapping(address => AgentPassport) public passports;
    mapping(address => SpendPolicy)   public spendPolicies;
    mapping(address => uint256)       public dailySpent;    // reset each day
    mapping(address => uint256)       public lastSpendDay;  // block.timestamp / 1 day
    address[] public allAgents;

    // ── Events ───────────────────────────────────────────────────────────────
    event AgentRegistered(address indexed agent, address indexed owner, string did, string name);
    event AgentUpdated(address indexed agent, string field);
    event AgentRevoked(address indexed agent, address indexed by);
    event TrustLevelChanged(address indexed agent, TrustLevel oldLevel, TrustLevel newLevel);
    event SpendPolicySet(address indexed agent, uint256 dailyLimit, uint256 perTxLimit);
    event ActionVerified(address indexed agent, bytes32 indexed actionId, uint256 value);

    // ── Errors ───────────────────────────────────────────────────────────────
    error AgentAlreadyRegistered();
    error AgentNotFound();
    error AgentNotActive();
    error NotAgentOwner();
    error DailyLimitExceeded(uint256 attempted, uint256 limit);
    error PerTxLimitExceeded(uint256 attempted, uint256 limit);
    error InvalidSignature();
    error DeadlineExpired();
    error InvalidNonce();

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor() Ownable(msg.sender) EIP712("KaiAgentRegistry", "1") {}

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyAgentOwner(address agent) {
        if (passports[agent].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    modifier agentExists(address agent) {
        if (passports[agent].registeredAt == 0) revert AgentNotFound();
        _;
    }

    // ── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Register a new agent and mint its DID passport.
     * @param agentAddress  The agent's signing address.
     * @param name          Human-readable agent name.
     * @param description   What the agent does.
     * @param serviceEndpoint  HTTPS endpoint for x402 callbacks.
     * @param capabilities  JSON string of capabilities (stored as hash).
     * @param dailySpendLimit  Maximum wei the agent may spend per day.
     * @param perTxLimit    Maximum wei per single transaction.
     */
    function registerAgent(
        address agentAddress,
        string  calldata name,
        string  calldata description,
        string  calldata serviceEndpoint,
        string  calldata capabilities,
        uint256 dailySpendLimit,
        uint256 perTxLimit
    ) external returns (string memory did) {
        if (passports[agentAddress].registeredAt != 0) revert AgentAlreadyRegistered();

        did = string(abi.encodePacked(
            "did:kai:", _toString(block.chainid), ":", _toHexString(agentAddress)
        ));

        passports[agentAddress] = AgentPassport({
            agentAddress:    agentAddress,
            owner:           msg.sender,
            did:             did,
            name:            name,
            description:     description,
            serviceEndpoint: serviceEndpoint,
            capabilityHash:  keccak256(bytes(capabilities)),
            dailySpendLimit: dailySpendLimit,
            perTxLimit:      perTxLimit,
            trustLevel:      TrustLevel.REGISTERED,
            active:          true,
            registeredAt:    block.timestamp,
            updatedAt:       block.timestamp,
            nonce:           0
        });

        spendPolicies[agentAddress] = SpendPolicy({
            dailyLimit:     dailySpendLimit,
            perTxLimit:     perTxLimit,
            allowedTokens:  new address[](0),
            requiresEscrow: false
        });

        allAgents.push(agentAddress);
        emit AgentRegistered(agentAddress, msg.sender, did, name);
    }

    // ── Spend Policy Enforcement ──────────────────────────────────────────────

    /**
     * @notice Called by escrow/payment contracts before transferring value.
     *         Enforces daily and per-tx limits. Reverts if exceeded.
     */
    function checkAndRecordSpend(address agent, uint256 amount)
        external
        agentExists(agent)
    {
        AgentPassport storage p = passports[agent];
        if (!p.active) revert AgentNotActive();

        SpendPolicy storage policy = spendPolicies[agent];
        if (amount > policy.perTxLimit && policy.perTxLimit > 0)
            revert PerTxLimitExceeded(amount, policy.perTxLimit);

        uint256 today = block.timestamp / 1 days;
        if (lastSpendDay[agent] < today) {
            dailySpent[agent]   = 0;
            lastSpendDay[agent] = today;
        }

        uint256 newTotal = dailySpent[agent] + amount;
        if (policy.dailyLimit > 0 && newTotal > policy.dailyLimit)
            revert DailyLimitExceeded(newTotal, policy.dailyLimit);

        dailySpent[agent] = newTotal;
    }

    // ── EIP-712 Signature Verification ────────────────────────────────────────

    /**
     * @notice Verify that an agent signed an action with valid credentials.
     *         Used by x402 facilitators before releasing service access.
     * @return signer  The recovered address (must equal agent).
     */
    function verifyAgentSignature(
        address agent,
        bytes32 actionId,
        uint256 value,
        uint256 deadline,
        bytes   calldata signature
    ) external agentExists(agent) returns (address signer) {
        if (block.timestamp > deadline) revert DeadlineExpired();

        AgentPassport storage p = passports[agent];
        if (!p.active) revert AgentNotActive();

        bytes32 structHash = keccak256(abi.encode(
            ACTION_TYPEHASH,
            agent,
            actionId,
            value,
            p.nonce,
            deadline
        ));

        bytes32 digest = _hashTypedDataV4(structHash);
        signer = digest.recover(signature);

        if (signer != agent) revert InvalidSignature();

        p.nonce++;
        emit ActionVerified(agent, actionId, value);
    }

    // ── Trust Level Management ────────────────────────────────────────────────

    function setTrustLevel(address agent, TrustLevel level)
        external
        onlyOwner
        agentExists(agent)
    {
        TrustLevel old = passports[agent].trustLevel;
        passports[agent].trustLevel = level;
        passports[agent].updatedAt  = block.timestamp;
        emit TrustLevelChanged(agent, old, level);
    }

    function updateSpendPolicy(
        address   agent,
        uint256   dailyLimit,
        uint256   perTxLimit,
        address[] calldata allowedTokens,
        bool      requiresEscrow
    ) external onlyAgentOwner(agent) agentExists(agent) {
        spendPolicies[agent] = SpendPolicy({
            dailyLimit:     dailyLimit,
            perTxLimit:     perTxLimit,
            allowedTokens:  allowedTokens,
            requiresEscrow: requiresEscrow
        });
        passports[agent].dailySpendLimit = dailyLimit;
        passports[agent].perTxLimit      = perTxLimit;
        passports[agent].updatedAt       = block.timestamp;
        emit SpendPolicySet(agent, dailyLimit, perTxLimit);
    }

    function revokeAgent(address agent)
        external
        agentExists(agent)
    {
        AgentPassport storage p = passports[agent];
        if (p.owner != msg.sender && owner() != msg.sender) revert NotAgentOwner();
        p.active    = false;
        p.updatedAt = block.timestamp;
        emit AgentRevoked(agent, msg.sender);
    }

    function updateServiceEndpoint(address agent, string calldata endpoint)
        external
        onlyAgentOwner(agent)
        agentExists(agent)
    {
        passports[agent].serviceEndpoint = endpoint;
        passports[agent].updatedAt       = block.timestamp;
        emit AgentUpdated(agent, "serviceEndpoint");
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    function isAgentActive(address agent) external view returns (bool) {
        return passports[agent].active && passports[agent].registeredAt > 0;
    }

    function getDID(address agent) external view returns (string memory) {
        return passports[agent].did;
    }

    function getTrustLevel(address agent) external view returns (TrustLevel) {
        return passports[agent].trustLevel;
    }

    function agentCount() external view returns (uint256) {
        return allAgents.length;
    }

    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ── Internal utils ────────────────────────────────────────────────────────

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory data   = abi.encodePacked(addr);
        bytes memory HEX    = "0123456789abcdef";
        bytes memory result = new bytes(42);
        result[0] = "0"; result[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            result[2 + i * 2]     = HEX[uint8(data[i] >> 4)];
            result[3 + i * 2]     = HEX[uint8(data[i] & 0x0f)];
        }
        return string(result);
    }
}
