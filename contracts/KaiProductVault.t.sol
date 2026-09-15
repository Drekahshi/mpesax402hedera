// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiProductVault} from "./KaiProductVault.sol";

contract KaiProductVaultTest is Test {
    KaiProductVault vault;
    address payable treasury = payable(makeAddr("treasury"));
    address alice = makeAddr("alice");
    uint256 constant INITIAL_FEE = 0.001 ether;

    function setUp() public {
        vault = new KaiProductVault(treasury, INITIAL_FEE);
        vm.deal(alice, 10 ether);
    }

    function test_InitialConfiguration() public view {
        assertEq(vault.treasury(), treasury);
        assertEq(vault.fee(), INITIAL_FEE);
    }

    function test_DepositWithFee() public {
        vm.startPrank(alice);
        uint256 treasuryBalanceBefore = treasury.balance;

        vault.deposit{value: INITIAL_FEE}("trust", "NVR", 100);

        assertEq(vault.getProductBalance(alice, "trust"), 100);
        assertEq(vault.productTotalVolume("trust"), 100);
        assertEq(vault.userInteractionCount(alice), 1);
        assertEq(treasury.balance, treasuryBalanceBefore + INITIAL_FEE);
        vm.stopPrank();
    }

    function test_DepositRevertUnderpaidFee() public {
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                KaiProductVault.InsufficientFee.selector,
                INITIAL_FEE,
                0.0005 ether
            )
        );
        vault.deposit{value: 0.0005 ether}("trust", "NVR", 100);
        vm.stopPrank();
    }

    function test_WithdrawWithFee() public {
        vm.startPrank(alice);
        vault.deposit{value: INITIAL_FEE}("trust", "NVR", 100);

        uint256 treasuryBalanceBefore = treasury.balance;
        vault.withdraw{value: INITIAL_FEE}("trust", "NVR", 40);

        assertEq(vault.getProductBalance(alice, "trust"), 60);
        assertEq(treasury.balance, treasuryBalanceBefore + INITIAL_FEE);
        vm.stopPrank();
    }

    function test_ExecuteEcosystemAction() public {
        vm.startPrank(alice);
        uint256 treasuryBalanceBefore = treasury.balance;

        vault.executeEcosystemAction{value: INITIAL_FEE}(
            "POLICY_STAKE",
            "CFA_PROTECTION_ZONE",
            500
        );

        assertEq(vault.userInteractionCount(alice), 1);
        assertEq(treasury.balance, treasuryBalanceBefore + INITIAL_FEE);
        vm.stopPrank();
    }
}
