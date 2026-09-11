// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiVault} from "./KaiVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract KaiVaultTest is Test {
    KaiVault vault;
    MockToken token;
    address owner = address(this);
    address alice = makeAddr("alice");
    uint256 constant INITIAL_SUPPLY = 1_000_000e18;

    function setUp() public {
        token = new MockToken("Mock Token", "MOCK");
        vault = new KaiVault(address(token), "KAI Vault", "kvMOCK", 1500);
        token.mint(alice, INITIAL_SUPPLY);
    }

    function test_Deposit() public {
        uint256 amount = 100e18;
        vm.prank(alice);
        token.approve(address(vault), amount);

        vm.prank(alice);
        uint256 shares = vault.deposit(amount);

        assertEq(shares, amount, "First deposit should be 1:1");
        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalAssets(), amount);
    }

    function test_DepositZeroReverts() public {
        vm.expectRevert(KaiVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    function test_Withdraw() public {
        uint256 amount = 100e18;
        vm.startPrank(alice);
        token.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount);
        uint256 assets = vault.withdraw(shares);
        vm.stopPrank();

        assertEq(assets, amount);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.totalAssets(), 0);
    }

    function test_WithdrawInsufficientShares() public {
        vm.expectRevert(KaiVault.InsufficientShares.selector);
        vault.withdraw(1);
    }

    function test_AddYield() public {
        uint256 amount = 100e18;
        uint256 yieldAmt = 50e18;

        vm.startPrank(alice);
        token.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        token.mint(owner, yieldAmt);
        token.approve(address(vault), yieldAmt);
        vault.addYield(yieldAmt);

        assertEq(vault.totalAssets(), amount + yieldAmt);

        uint256 shares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 assets = vault.withdraw(shares);
        assertEq(assets, amount + yieldAmt);
    }

    function test_AddYieldOnlyOwner() public {
        token.mint(alice, 50e18);
        vm.startPrank(alice);
        token.approve(address(vault), 50e18);
        vm.expectRevert();
        vault.addYield(50e18);
        vm.stopPrank();
    }

    function test_SharePriceIncreasesWithYield() public {
        uint256 amount = 100e18;
        vm.startPrank(alice);
        token.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();

        uint256 priceBefore = vault.sharePrice();

        uint256 yieldAmt = 50e18;
        token.mint(owner, yieldAmt);
        token.approve(address(vault), yieldAmt);
        vault.addYield(yieldAmt);

        uint256 priceAfter = vault.sharePrice();
        assertGt(priceAfter, priceBefore, "Share price should increase after yield");
    }
}
