// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title KaiVault
 * @notice Single-token yield vault. Users deposit an ERC-20 and receive
 *         share tokens (kvTOKEN) representing their proportional claim on the
 *         vault's assets. The owner can deposit yield (via `addYield`) to
 *         grow the vault's total assets, increasing the share price over time.
 *
 * Share price formula (ERC-4626 style):
 *   sharePrice = totalAssets / totalShares
 *
 * Key operations:
 *   deposit(assets)      — mint shares to caller
 *   withdraw(shares)     — burn shares, return proportional assets
 *   addYield(amount)     — owner deposits yield; increases share price
 *   previewDeposit()     — off-chain quote: assets → shares
 *   previewWithdraw()    — off-chain quote: shares → assets
 */
contract KaiVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ────────────────────────────────────────────────────────────────
    IERC20  public immutable asset;       // underlying ERC-20 token
    uint256 public totalAssets;           // total tokens held in vault (principal + yield)
    uint256 public apyBps;                // informational APY in basis points (e.g. 1500 = 15%)

    // ── Events ───────────────────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 assets, uint256 shares);
    event Withdrawn(address indexed user, uint256 shares, uint256 assets);
    event YieldAdded(uint256 amount, uint256 newTotalAssets);
    event ApyUpdated(uint256 oldBps, uint256 newBps);

    // ── Errors ───────────────────────────────────────────────────────────────
    error ZeroAmount();
    error InsufficientShares();
    error InsufficientAssets();

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address asset_,
        string memory name_,
        string memory symbol_,
        uint256 apyBps_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        asset  = IERC20(asset_);
        apyBps = apyBps_;
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    /// @notice How many shares would `assets` mint right now?
    function previewDeposit(uint256 assets) public view returns (uint256 shares) {
        uint256 supply = totalSupply();
        if (supply == 0 || totalAssets == 0) return assets; // 1:1 on first deposit
        return (assets * supply) / totalAssets;
    }

    /// @notice How many assets would `shares` redeem right now?
    function previewWithdraw(uint256 shares) public view returns (uint256 assets) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        return (shares * totalAssets) / supply;
    }

    /// @notice Share price in asset units (18-decimal fixed point).
    function sharePrice() external view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18;
        return (totalAssets * 1e18) / supply;
    }

    // ── Core operations ──────────────────────────────────────────────────────

    /**
     * @notice Deposit `assets` tokens, receive proportional vault shares.
     * @param assets Amount of underlying token to deposit.
     */
    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        shares = previewDeposit(assets);
        if (shares == 0) revert ZeroAmount();

        asset.safeTransferFrom(msg.sender, address(this), assets);
        totalAssets += assets;
        _mint(msg.sender, shares);

        emit Deposited(msg.sender, assets, shares);
    }

    /**
     * @notice Burn `shares`, receive proportional underlying assets.
     * @param shares Number of vault shares to redeem.
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < shares) revert InsufficientShares();

        assets = previewWithdraw(shares);
        if (assets == 0) revert InsufficientAssets();

        _burn(msg.sender, shares);
        totalAssets -= assets;
        asset.safeTransfer(msg.sender, assets);

        emit Withdrawn(msg.sender, shares, assets);
    }

    /**
     * @notice Owner adds yield to the vault (increases share price).
     *         Call this periodically with accrued interest/fees.
     */
    function addYield(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert ZeroAmount();
        asset.safeTransferFrom(msg.sender, address(this), amount);
        totalAssets += amount;
        emit YieldAdded(amount, totalAssets);
    }

    /// @notice Update the informational APY display.
    function setApy(uint256 newBps) external onlyOwner {
        emit ApyUpdated(apyBps, newBps);
        apyBps = newBps;
    }
}
