// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title KaiPool
 * @notice Constant-product AMM pool (x * y = k) for any two ERC-20 tokens.
 *         Liquidity providers receive LP tokens representing their share of
 *         the pool. A 0.3% swap fee is retained in the pool and accrues to LPs.
 *
 * Key operations:
 *   addLiquidity(amtA, amtB, minLP)   — deposit both tokens, mint LP tokens
 *   removeLiquidity(lpAmount, minA, minB) — burn LP tokens, receive both tokens
 *   swapExactIn(tokenIn, amtIn, minOut)   — swap exact input for ≥ minOut
 *   getAmountOut(tokenIn, amtIn)          — off-chain price quote
 */
contract KaiPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Immutables ───────────────────────────────────────────────────────────
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    // ── Reserves ────────────────────────────────────────────────────────────
    uint256 public reserveA;
    uint256 public reserveB;

    // ── Fee: 0.3% (30 / 10000) ──────────────────────────────────────────────
    uint256 private constant FEE_NUM   = 30;
    uint256 private constant FEE_DENOM = 10_000;
    uint256 private constant MIN_LIQUIDITY = 1_000; // burned on first deposit (UNISWAP style)

    // ── Events ───────────────────────────────────────────────────────────────
    event LiquidityAdded(address indexed provider, uint256 amtA, uint256 amtB, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 lpBurned, uint256 amtA, uint256 amtB);
    event Swapped(address indexed user, address tokenIn, uint256 amtIn, address tokenOut, uint256 amtOut);

    // ── Errors ───────────────────────────────────────────────────────────────
    error ZeroAmount();
    error SlippageExceeded();
    error InvalidToken();
    error InsufficientLiquidity();
    error InsufficientLPBalance();

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address tokenA_,
        address tokenB_,
        string memory lpName_,
        string memory lpSymbol_
    ) ERC20(lpName_, lpSymbol_) {
        require(tokenA_ != tokenB_, "KaiPool: identical tokens");
        tokenA = IERC20(tokenA_);
        tokenB = IERC20(tokenB_);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    function _sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }

    // ── View: price quote ────────────────────────────────────────────────────

    /**
     * @notice Given `amtIn` of `tokenIn`, how much of the other token comes out?
     *         Applies the 0.3% fee. Returns 0 if pool is empty.
     */
    function getAmountOut(address tokenIn, uint256 amtIn) public view returns (uint256 amtOut) {
        if (tokenIn != address(tokenA) && tokenIn != address(tokenB)) revert InvalidToken();
        if (amtIn == 0) return 0;

        (uint256 resIn, uint256 resOut) = tokenIn == address(tokenA)
            ? (reserveA, reserveB)
            : (reserveB, reserveA);

        if (resIn == 0 || resOut == 0) return 0;

        uint256 amtInWithFee = amtIn * (FEE_DENOM - FEE_NUM);
        amtOut = (amtInWithFee * resOut) / (resIn * FEE_DENOM + amtInWithFee);
    }

    /// @notice Spot price of tokenA in tokenB units (18-decimal).
    function spotPrice() external view returns (uint256) {
        if (reserveA == 0) return 0;
        return (reserveB * 1e18) / reserveA;
    }

    // ── Liquidity ────────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity to the pool and receive LP tokens.
     * @param amtA   Desired amount of tokenA.
     * @param amtB   Desired amount of tokenB.
     * @param minLP  Minimum LP tokens to receive (slippage guard).
     */
    function addLiquidity(
        uint256 amtA,
        uint256 amtB,
        uint256 minLP
    ) external nonReentrant returns (uint256 lpMinted) {
        if (amtA == 0 || amtB == 0) revert ZeroAmount();

        tokenA.safeTransferFrom(msg.sender, address(this), amtA);
        tokenB.safeTransferFrom(msg.sender, address(this), amtB);

        uint256 supply = totalSupply();
        if (supply == 0) {
            // First deposit: geometric mean, burn MIN_LIQUIDITY
            lpMinted = _sqrt(amtA * amtB) - MIN_LIQUIDITY;
            _mint(address(0xdead), MIN_LIQUIDITY); // permanent lock
        } else {
            lpMinted = _min(
                (amtA * supply) / reserveA,
                (amtB * supply) / reserveB
            );
        }

        if (lpMinted < minLP) revert SlippageExceeded();
        if (lpMinted == 0)    revert InsufficientLiquidity();

        reserveA += amtA;
        reserveB += amtB;
        _mint(msg.sender, lpMinted);

        emit LiquidityAdded(msg.sender, amtA, amtB, lpMinted);
    }

    /**
     * @notice Remove liquidity by burning LP tokens.
     * @param lpAmount  LP tokens to burn.
     * @param minA      Minimum tokenA to receive.
     * @param minB      Minimum tokenB to receive.
     */
    function removeLiquidity(
        uint256 lpAmount,
        uint256 minA,
        uint256 minB
    ) external nonReentrant returns (uint256 amtA, uint256 amtB) {
        if (lpAmount == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < lpAmount) revert InsufficientLPBalance();

        uint256 supply = totalSupply();
        amtA = (lpAmount * reserveA) / supply;
        amtB = (lpAmount * reserveB) / supply;

        if (amtA < minA || amtB < minB) revert SlippageExceeded();

        _burn(msg.sender, lpAmount);
        reserveA -= amtA;
        reserveB -= amtB;

        tokenA.safeTransfer(msg.sender, amtA);
        tokenB.safeTransfer(msg.sender, amtB);

        emit LiquidityRemoved(msg.sender, lpAmount, amtA, amtB);
    }

    // ── Swap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Swap an exact amount of `tokenIn` for at least `minOut` of the other token.
     * @param tokenIn  Address of input token (must be tokenA or tokenB).
     * @param amtIn    Exact amount to send.
     * @param minOut   Minimum output amount (slippage guard).
     */
    function swapExactIn(
        address tokenIn,
        uint256 amtIn,
        uint256 minOut
    ) external nonReentrant returns (uint256 amtOut) {
        if (tokenIn != address(tokenA) && tokenIn != address(tokenB)) revert InvalidToken();
        if (amtIn == 0) revert ZeroAmount();

        amtOut = getAmountOut(tokenIn, amtIn);
        if (amtOut < minOut) revert SlippageExceeded();
        if (amtOut == 0)     revert InsufficientLiquidity();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amtIn);

        address tokenOut;
        if (tokenIn == address(tokenA)) {
            reserveA += amtIn;
            reserveB -= amtOut;
            tokenOut = address(tokenB);
        } else {
            reserveB += amtIn;
            reserveA -= amtOut;
            tokenOut = address(tokenA);
        }

        IERC20(tokenOut).safeTransfer(msg.sender, amtOut);
        emit Swapped(msg.sender, tokenIn, amtIn, tokenOut, amtOut);
    }
}
