// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiAMM} from "./KaiAMM.sol";
import {KaiPool} from "./KaiPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken3 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract KaiAMMTest is Test {
    KaiAMM amm;
    KaiPool pool;
    MockToken3 tokenA;
    MockToken3 tokenB;
    address alice = makeAddr("alice");
    uint256 constant SUPPLY = 1_000_000e18;

    function setUp() public {
        amm = new KaiAMM();
        tokenA = new MockToken3("Token A", "TKA");
        tokenB = new MockToken3("Token B", "TKB");
        pool = new KaiPool(address(tokenA), address(tokenB), "KAI LP", "kLP");

        amm.registerPool(address(tokenA), address(tokenB), address(pool));

        tokenA.mint(alice, SUPPLY);
        tokenB.mint(alice, SUPPLY);
    }

    function test_RegisterPool() public {
        MockToken3 fake = new MockToken3("Fake", "FAKE");
        MockToken3 fake2 = new MockToken3("Fake2", "FAK2");
        KaiPool newPool = new KaiPool(address(fake), address(fake2), "LP", "LP2");

        amm.registerPool(address(fake), address(fake2), address(newPool));
        assertEq(amm.poolCount(), 2);
    }

    function test_RegisterPoolIdenticalTokens() public {
        vm.expectRevert(KaiAMM.IdenticalTokens.selector);
        amm.registerPool(address(tokenA), address(tokenA), address(pool));
    }

    function test_RegisterPoolDuplicate() public {
        vm.expectRevert(KaiAMM.PoolAlreadyExists.selector);
        amm.registerPool(address(tokenA), address(tokenB), address(pool));
    }

    function test_GetPool() public {
        address found = amm.getPool(address(tokenA), address(tokenB));
        assertEq(found, address(pool));
    }

    function test_GetPoolReverse() public {
        address found = amm.getPool(address(tokenB), address(tokenA));
        assertEq(found, address(pool), "Should find pool regardless of token order");
    }

    function test_AddLiquidityViaRouter() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(amm), amtA);
        tokenB.approve(address(amm), amtB);
        uint256 lp = amm.addLiquidity(address(tokenA), address(tokenB), amtA, amtB, 0);
        vm.stopPrank();

        assertGt(lp, 0, "Should mint LP tokens");
        assertEq(pool.balanceOf(alice), lp);
    }

    function test_SwapViaRouter() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(amm), amtA + 1000e18);
        tokenB.approve(address(amm), amtB);
        amm.addLiquidity(address(tokenA), address(tokenB), amtA, amtB, 0);

        uint256 swapIn = 100e18;
        uint256 out = amm.swap(address(tokenA), address(tokenB), swapIn, 1);
        vm.stopPrank();

        assertGt(out, 0, "Should get output");
        assertLt(out, swapIn, "Output < input due to fees");
    }

    function test_RemoveLiquidityViaRouter() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(amm), amtA);
        tokenB.approve(address(amm), amtB);
        uint256 lp = amm.addLiquidity(address(tokenA), address(tokenB), amtA, amtB, 0);
        pool.approve(address(amm), lp);

        uint256 balBefore = tokenA.balanceOf(alice);
        amm.removeLiquidity(address(tokenA), address(tokenB), lp, 0, 0);
        vm.stopPrank();

        assertGt(tokenA.balanceOf(alice), balBefore, "Should receive tokens back");
    }

    function test_SwapPoolNotFound() public {
        MockToken3 fake = new MockToken3("Fake", "FAKE");
        vm.expectRevert(KaiAMM.PoolNotFound.selector);
        amm.swap(address(tokenA), address(fake), 100e18, 1);
    }
}
