// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiPool} from "./KaiPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken2 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract KaiPoolTest is Test {
    KaiPool pool;
    MockToken2 tokenA;
    MockToken2 tokenB;
    address alice = makeAddr("alice");
    uint256 constant SUPPLY = 1_000_000e18;

    function setUp() public {
        tokenA = new MockToken2("Token A", "TKA");
        tokenB = new MockToken2("Token B", "TKB");
        pool = new KaiPool(address(tokenA), address(tokenB), "KAI LP", "kLP");
        tokenA.mint(alice, SUPPLY);
        tokenB.mint(alice, SUPPLY);
    }

    function test_AddLiquidity() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amtA);
        tokenB.approve(address(pool), amtB);
        uint256 lp = pool.addLiquidity(amtA, amtB, 0);
        vm.stopPrank();

        assertGt(lp, 0, "Should mint LP tokens");
        assertEq(pool.reserveA(), amtA);
        assertEq(pool.reserveB(), amtB);
    }

    function test_AddLiquidityZeroReverts() public {
        vm.expectRevert(KaiPool.ZeroAmount.selector);
        pool.addLiquidity(0, 100e18, 0);
    }

    function test_Swap() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amtA + 1000e18);
        tokenB.approve(address(pool), amtB);
        pool.addLiquidity(amtA, amtB, 0);

        uint256 swapIn = 100e18;
        uint256 minOut = 1;
        uint256 amtOut = pool.swapExactIn(address(tokenA), swapIn, minOut);
        vm.stopPrank();

        assertGt(amtOut, 0, "Should get some output");
        assertLt(amtOut, swapIn, "Output should be less than input due to fees");
    }

    function test_SwapZeroReverts() public {
        vm.expectRevert(KaiPool.ZeroAmount.selector);
        pool.swapExactIn(address(tokenA), 0, 0);
    }

    function test_RemoveLiquidity() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amtA);
        tokenB.approve(address(pool), amtB);
        uint256 lp = pool.addLiquidity(amtA, amtB, 0);

        uint256 balBefore = tokenA.balanceOf(alice);
        pool.removeLiquidity(lp, 0, 0);
        vm.stopPrank();

        assertGt(tokenA.balanceOf(alice), balBefore, "Should receive tokens back");
    }

    function test_SpotPrice() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 20_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amtA);
        tokenB.approve(address(pool), amtB);
        pool.addLiquidity(amtA, amtB, 0);
        vm.stopPrank();

        uint256 price = pool.spotPrice();
        assertEq(price, 2e18, "Spot price should be 2:1");
    }

    function test_GetAmountOut() public {
        uint256 amtA = 10_000e18;
        uint256 amtB = 10_000e18;

        vm.startPrank(alice);
        tokenA.approve(address(pool), amtA);
        tokenB.approve(address(pool), amtB);
        pool.addLiquidity(amtA, amtB, 0);
        vm.stopPrank();

        uint256 out = pool.getAmountOut(address(tokenA), 1000e18);
        assertGt(out, 0, "Should return non-zero output");
        assertLt(out, 1000e18, "Output should be less due to fees");
    }

    function test_GetAmountOutInvalidToken() public {
        MockToken2 fake = new MockToken2("Fake", "FAKE");
        vm.expectRevert(KaiPool.InvalidToken.selector);
        pool.getAmountOut(address(fake), 1000e18);
    }
}
