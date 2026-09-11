// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title KAIAirdropVault
 * @notice On-chain airdrop distribution vault for the future KAI token
 *         distribution (PRD 2 §11, §12). The Kainovari tokenomics engine
 *         computes per-user allocations off-chain and commits them to this
 *         contract as a Merkle root. Users claim their allocation by proving
 *         it against the root. A cooldown prevents a snapshot from being
 *         replaced before all claims are settled.
 *
 *         Keeps conversion/eligibility flexible: the admin can publish a new
 *         Merkle root for a later airdrop round, stale roots stay claimable
 *         by holders until the next round's cooldown elapses.
 */
contract KAIAirdropVault is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ROOT_SETTER_ROLE = keccak256("ROOT_SETTER_ROLE");

    /// Airdrop token (e.g. KAI / NVR). Can be changed by admin between rounds.
    IERC20 public token;

    /// Active Merkle root for the current claimable allocation.
    bytes32 public merkleRoot;

    /// True while claims are open; admin can pause in emergencies.
    bool public paused;

    /// Earned but not yet claimed per account (for non-Merkle direct grants).
    uint256 public constant FORCED = type(uint256).max;

    uint256 public constant FEE_BASIS = 10_000;

    /// Cooldown (seconds) that must elapse after a root update before a new
    /// root can be set again.
    uint256 public rootCooldown;

    /// When the current root was set (0 if none).
    uint256 public rootSetAt;

    /// Emitted when a user claims their airdrop allocation.
    event Claimed(address indexed account, uint256 amount);

    /// Emitted when a new allocation root is set.
    event RootUpdated(bytes32 indexed root);

    /// Emitted when the airdrop is paused / unpaused.
    event Paused(address account);
    event Unpaused(address account);

    /// Emitted when the token backing the vault is changed.
    event TokenUpdated(address indexed token);

    /// account => cumulative claimed amount for the CURRENT root.
    mapping(address => uint256) public claimed;

    error ZeroAddress();
    error NotEligible(address account);
    error AlreadyClaimed(address account);
    error PausedError();
    error NotPausedError();
    error StaleRoot();
    error CooldownActive(uint256 remaining);
    error NothingToWithdraw();

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    modifier whenPaused() {
        if (!paused) revert NotPausedError();
        _;
    }

    constructor(
        address token_,
        uint256 cooldown_
    ) {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        rootCooldown = cooldown_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(ROOT_SETTER_ROLE, msg.sender);
    }

    /**
     * @notice Claims an allocation by proving it against the active Merkle root.
     * @param amount Total amount the account is entitled to for this round.
     * @param proof  Merkle proof of (account, amount) membership.
     */
    function claim(
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused {
        _claim(msg.sender, amount, proof);
    }

    function _claim(
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) internal {
        if (merkleRoot == bytes32(0)) revert StaleRoot();

        bytes32 leaf = keccak256(abi.encode(account, amount));
        if (!MerkleProof.verify(proof, merkleRoot, leaf)) {
            revert NotEligible(account);
        }

        uint256 remaining = amount - claimed[account];
        if (remaining == 0) revert AlreadyClaimed(account);

        claimed[account] = amount;

        token.safeTransfer(account, remaining);

        emit Claimed(account, remaining);
    }

    /// @notice Claims on behalf of an address (e.g. a relayer / gas-less flow).
    function claimFor(
        address account,
        uint256 amount,
        bytes32[] calldata proof
    ) external whenNotPaused {
        _claim(account, amount, proof);
    }

    /// @notice Sets a new Merkle root, respecting the cooldown.
    function setMerkleRoot(bytes32 root_) external onlyRole(ROOT_SETTER_ROLE) whenNotPaused {
        uint256 elapsed = block.timestamp - rootSetAt;
        if (rootSetAt != 0 && elapsed < rootCooldown) {
            revert CooldownActive(rootCooldown - elapsed);
        }
        merkleRoot = root_;
        rootSetAt = block.timestamp;
        emit RootUpdated(root_);
    }

    /// @notice Swaps which token backs the vault (admin, between rounds).
    function setToken(address token_) external onlyRole(DEFAULT_ADMIN_ROLE) whenPaused {
        if (token_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        emit TokenUpdated(token_);
    }

    /// @notice Pauses claims + admin root changes.
    function pause() external onlyRole(PAUSER_ROLE) whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyRole(PAUSER_ROLE) whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Withdraws leftover / swept tokens after a round is settled.
    function withdraw(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) revert NothingToWithdraw();
        token.safeTransfer(to, balance);
    }

    /// @notice Grants a fixed amount to an account (non-Merkle path, admin).
    function grant(address account, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        if (account == address(0)) revert ZeroAddress();
        if (claimed[account] == 0) {
            claimed[account] = amount;
            token.safeTransfer(account, amount);
            emit Claimed(account, amount);
        } else {
            revert AlreadyClaimed(account);
        }
    }
}
