// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable}   from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20}    from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Minimal interface so KaiAMM never embeds KaiPool bytecode.
interface IKaiPool {
    function tokenA() external view returns (address);
    function tokenB() external view returns (address);
    function addLiquidity(uint256 amtA, uint256 amtB, uint256 minLP)
        external returns (uint256);
    function removeLiquidity(uint256 lpAmount, uint256 minA, uint256 minB)
        external returns (uint256, uint256);
    function swapExactIn(address tokenIn, uint256 amtIn, uint256 minOut)
        external returns (uint256);
}

/**
 * @title KaiAMM
 * @notice Registry + router for KaiPool instances.
 * Pools are deployed externally and registered here.
 */
contract KaiAMM is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => mapping(address => address)) private _pools;
    address[] public allPools;

    event PoolRegistered(address indexed t0, address indexed t1, address pool);

    error PoolNotFound();
    error PoolAlreadyExists();
    error IdenticalTokens();

    constructor() Ownable(msg.sender) {}

    function _sort(address a, address b) private pure returns (address t0, address t1) {
        (t0, t1) = a < b ? (a, b) : (b, a);
    }

    function registerPool(address tokenA, address tokenB, address pool) external onlyOwner {
        if (tokenA == tokenB) revert IdenticalTokens();
        (address t0, address t1) = _sort(tokenA, tokenB);
        if (_pools[t0][t1] != address(0)) revert PoolAlreadyExists();
        _pools[t0][t1] = pool;
        allPools.push(pool);
        emit PoolRegistered(t0, t1, pool);
    }

    function getPool(address tokenA, address tokenB) public view returns (address) {
        (address t0, address t1) = _sort(tokenA, tokenB);
        return _pools[t0][t1];
    }

    function poolCount() external view returns (uint256) { return allPools.length; }

    function addLiquidity(
        address tokenA, address tokenB,
        uint256 amtA,   uint256 amtB,  uint256 minLP
    ) external returns (uint256 lpMinted) {
        address pa = getPool(tokenA, tokenB);
        if (pa == address(0)) revert PoolNotFound();
        IKaiPool pool = IKaiPool(pa);
        address ta = pool.tokenA();
        address tb = pool.tokenB();
        (uint256 a, uint256 b) = ta == tokenA ? (amtA, amtB) : (amtB, amtA);
        IERC20(ta).safeTransferFrom(msg.sender, address(this), a);
        IERC20(tb).safeTransferFrom(msg.sender, address(this), b);
        IERC20(ta).forceApprove(pa, a);
        IERC20(tb).forceApprove(pa, b);
        lpMinted = pool.addLiquidity(a, b, minLP);
        IERC20(pa).safeTransfer(msg.sender, lpMinted);
    }

    function removeLiquidity(
        address tokenA, address tokenB,
        uint256 lpAmount, uint256 minA, uint256 minB
    ) external returns (uint256 outA, uint256 outB) {
        address pa = getPool(tokenA, tokenB);
        if (pa == address(0)) revert PoolNotFound();
        IKaiPool pool = IKaiPool(pa);
        address ta = pool.tokenA();
        address tb = pool.tokenB();
        IERC20(pa).safeTransferFrom(msg.sender, address(this), lpAmount);
        IERC20(pa).forceApprove(pa, lpAmount);
        (uint256 ra, uint256 rb) = pool.removeLiquidity(lpAmount, minA, minB);
        IERC20(ta).safeTransfer(msg.sender, ra);
        IERC20(tb).safeTransfer(msg.sender, rb);
        (outA, outB) = ta == tokenA ? (ra, rb) : (rb, ra);
    }

    function swap(
        address tokenIn, address tokenOut,
        uint256 amtIn,   uint256 minOut
    ) external returns (uint256 amtOut) {
        address pa = getPool(tokenIn, tokenOut);
        if (pa == address(0)) revert PoolNotFound();
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amtIn);
        IERC20(tokenIn).forceApprove(pa, amtIn);
        amtOut = IKaiPool(pa).swapExactIn(tokenIn, amtIn, minOut);
        IERC20(tokenOut).safeTransfer(msg.sender, amtOut);
    }
}
