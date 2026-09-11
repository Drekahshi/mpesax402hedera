// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20}         from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}      from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable}        from "@openzeppelin/contracts/access/Ownable.sol";

interface IKaiAgentRegistry {
    function isAgentActive(address agent) external view returns (bool);
    function getDID(address agent) external view returns (string memory);
    function checkAndRecordSpend(address agent, uint256 amount) external;
    function verifyAgentSignature(
        address agent, bytes32 actionId, uint256 value,
        uint256 deadline, bytes calldata signature
    ) external returns (address signer);
}

/**
 * @title KaiEscrow
 * @notice x402 Escrow contract for KAI Nuvari agentic payments.
 *
 * Flow:
 *   1. Payer calls deposit() with an ERC-20 token + amount → funds locked
 *   2. Agent performs the service
 *   3. Payer (or auto-release after timeout) calls release() → funds → provider
 *   4. If service fails, payer calls refund() before timeout → funds returned
 *
 * x402 Integration:
 *   - Every deposit is linked to an x402 payment ID (keccak256 of HTTP request)
 *   - The agent's DID is recorded on deposit
 *   - The registry's spend-policy is checked on every deposit
 *   - Providers can request immediate settlement by submitting an agent signature
 *
 * Fees:
 *   - Protocol fee: 0.1% of each settlement (goes to treasury)
 *   - No fee on refunds
 */
contract KaiEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ── Enums ────────────────────────────────────────────────────────────────
    enum EscrowStatus { PENDING, RELEASED, REFUNDED, DISPUTED }

    // ── Structs ──────────────────────────────────────────────────────────────
    struct EscrowRecord {
        bytes32     escrowId;       // keccak256(payer, provider, paymentRef, block)
        bytes32     paymentRef;     // x402 payment reference (HTTP request hash)
        address     payer;          // who locked the funds
        address     provider;       // who will receive on release
        address     agent;          // KAI agent DID address executing the work
        address     token;          // ERC-20 token (address(0) = ETH)
        uint256     amount;         // gross amount locked
        uint256     fee;            // protocol fee (deducted on release)
        uint256     lockedAt;       // block.timestamp when locked
        uint256     autoReleaseAt;  // auto-release timeout (payer set)
        string      agentDid;       // did:kai:... string
        string      serviceDesc;    // what the agent is doing
        EscrowStatus status;
    }

    // ── Config ───────────────────────────────────────────────────────────────
    IKaiAgentRegistry public immutable registry;
    address           public treasury;
    uint256           public feeBps = 10;           // 0.10% = 10 bps
    uint256           public constant MAX_FEE_BPS = 100; // 1% max

    // ── Storage ──────────────────────────────────────────────────────────────
    mapping(bytes32 => EscrowRecord) public escrows;
    bytes32[] public allEscrowIds;

    // ── Events ───────────────────────────────────────────────────────────────
    event Deposited(
        bytes32 indexed escrowId, bytes32 indexed paymentRef,
        address indexed payer, address provider, address agent,
        address token, uint256 amount, uint256 autoReleaseAt
    );
    event Released(bytes32 indexed escrowId, address indexed provider, uint256 netAmount, uint256 fee);
    event Refunded(bytes32 indexed escrowId, address indexed payer, uint256 amount);
    event Disputed(bytes32 indexed escrowId, address indexed raisedBy);
    event FeeUpdated(uint256 oldBps, uint256 newBps);

    // ── Errors ───────────────────────────────────────────────────────────────
    error EscrowNotFound();
    error EscrowNotPending();
    error NotPayer();
    error NotProvider();
    error AgentNotActive();
    error AutoReleaseNotReached();
    error AutoReleaseExpired();
    error ZeroAmount();
    error InvalidFee();
    error NativeTransferFailed();

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(address registry_, address treasury_)
        Ownable(msg.sender)
    {
        registry = IKaiAgentRegistry(registry_);
        treasury = treasury_;
    }

    // ── Core: Deposit ─────────────────────────────────────────────────────────

    /**
     * @notice Lock ERC-20 tokens in escrow for an agent service payment.
     * @param paymentRef     x402 HTTP payment reference (keccak of request).
     * @param provider       Address that will receive funds on successful release.
     * @param agent          KAI agent address registered in KaiAgentRegistry.
     * @param token          ERC-20 token address (use address(0) for native ETH/HBAR).
     * @param amount         Amount to lock (gross; fee deducted on release).
     * @param autoReleaseSec Seconds until auto-release if payer doesn't act.
     * @param serviceDesc    Human-readable description of service being paid for.
     */
    function deposit(
        bytes32 paymentRef,
        address provider,
        address agent,
        address token,
        uint256 amount,
        uint256 autoReleaseSec,
        string  calldata serviceDesc
    ) external payable nonReentrant returns (bytes32 escrowId) {
        if (amount == 0) revert ZeroAmount();
        if (!registry.isAgentActive(agent)) revert AgentNotActive();

        // Enforce agent spend policy
        registry.checkAndRecordSpend(agent, amount);

        // Pull funds
        if (token == address(0)) {
            require(msg.value == amount, "KaiEscrow: ETH amount mismatch");
        } else {
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        uint256 fee = (amount * feeBps) / 10_000;

        escrowId = keccak256(abi.encodePacked(
            msg.sender, provider, paymentRef, block.timestamp
        ));

        escrows[escrowId] = EscrowRecord({
            escrowId:      escrowId,
            paymentRef:    paymentRef,
            payer:         msg.sender,
            provider:      provider,
            agent:         agent,
            token:         token,
            amount:        amount,
            fee:           fee,
            lockedAt:      block.timestamp,
            autoReleaseAt: block.timestamp + autoReleaseSec,
            agentDid:      registry.getDID(agent),
            serviceDesc:   serviceDesc,
            status:        EscrowStatus.PENDING
        });

        allEscrowIds.push(escrowId);

        emit Deposited(
            escrowId, paymentRef, msg.sender, provider, agent,
            token, amount, block.timestamp + autoReleaseSec
        );
    }

    // ── Core: Release ─────────────────────────────────────────────────────────

    /**
     * @notice Release funds to provider. Called by payer (manual approval)
     *         or by anyone after autoReleaseAt has passed.
     */
    function release(bytes32 escrowId) external nonReentrant {
        EscrowRecord storage e = _getEscrow(escrowId);

        bool isPayer    = msg.sender == e.payer;
        bool isAutoTime = block.timestamp >= e.autoReleaseAt;

        if (!isPayer && !isAutoTime) revert AutoReleaseNotReached();

        e.status = EscrowStatus.RELEASED;
        uint256 net = e.amount - e.fee;

        _transfer(e.token, e.provider, net);
        if (e.fee > 0) _transfer(e.token, treasury, e.fee);

        emit Released(escrowId, e.provider, net, e.fee);
    }

    /**
     * @notice Provider can request immediate release by submitting a valid
     *         EIP-712 agent signature proving the service was delivered.
     */
    function releaseWithSignature(
        bytes32 escrowId,
        uint256 deadline,
        bytes   calldata agentSignature
    ) external nonReentrant {
        EscrowRecord storage e = _getEscrow(escrowId);

        // Verify the agent signed off on this specific payment
        bytes32 actionId = keccak256(abi.encodePacked("release", escrowId));
        registry.verifyAgentSignature(e.agent, actionId, e.amount, deadline, agentSignature);

        e.status = EscrowStatus.RELEASED;
        uint256 net = e.amount - e.fee;

        _transfer(e.token, e.provider, net);
        if (e.fee > 0) _transfer(e.token, treasury, e.fee);

        emit Released(escrowId, e.provider, net, e.fee);
    }

    // ── Core: Refund ──────────────────────────────────────────────────────────

    /**
     * @notice Payer requests refund. Only allowed before autoReleaseAt.
     */
    function refund(bytes32 escrowId) external nonReentrant {
        EscrowRecord storage e = _getEscrow(escrowId);
        if (msg.sender != e.payer) revert NotPayer();
        if (block.timestamp >= e.autoReleaseAt) revert AutoReleaseExpired();

        e.status = EscrowStatus.REFUNDED;
        _transfer(e.token, e.payer, e.amount); // full refund, no fee
        emit Refunded(escrowId, e.payer, e.amount);
    }

    // ── Core: Dispute ─────────────────────────────────────────────────────────

    /**
     * @notice Either party can raise a dispute. Freezes the escrow until
     *         the registry owner resolves it manually.
     */
    function dispute(bytes32 escrowId) external {
        EscrowRecord storage e = _getEscrow(escrowId);
        if (msg.sender != e.payer && msg.sender != e.provider) revert NotPayer();
        e.status = EscrowStatus.DISPUTED;
        emit Disputed(escrowId, msg.sender);
    }

    /**
     * @notice Owner resolves a dispute — choose to release or refund.
     */
    function resolveDispute(bytes32 escrowId, bool releaseToProvider)
        external
        onlyOwner
        nonReentrant
    {
        EscrowRecord storage e = escrows[escrowId];
        require(e.status == EscrowStatus.DISPUTED, "KaiEscrow: not disputed");
        if (releaseToProvider) {
            e.status = EscrowStatus.RELEASED;
            uint256 net = e.amount - e.fee;
            _transfer(e.token, e.provider, net);
            if (e.fee > 0) _transfer(e.token, treasury, e.fee);
            emit Released(escrowId, e.provider, net, e.fee);
        } else {
            e.status = EscrowStatus.REFUNDED;
            _transfer(e.token, e.payer, e.amount);
            emit Refunded(escrowId, e.payer, e.amount);
        }
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function setFee(uint256 newBps) external onlyOwner {
        if (newBps > MAX_FEE_BPS) revert InvalidFee();
        emit FeeUpdated(feeBps, newBps);
        feeBps = newBps;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }

    // ── View ──────────────────────────────────────────────────────────────────

    function getEscrow(bytes32 escrowId) external view returns (EscrowRecord memory) {
        return escrows[escrowId];
    }

    function escrowCount() external view returns (uint256) {
        return allEscrowIds.length;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _getEscrow(bytes32 escrowId) internal view returns (EscrowRecord storage e) {
        e = escrows[escrowId];
        if (e.lockedAt == 0)           revert EscrowNotFound();
        if (e.status != EscrowStatus.PENDING) revert EscrowNotPending();
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // Accept native ETH/HBAR deposits
    receive() external payable {}
}
