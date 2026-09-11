// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KAIAirdropVault} from "./KAIAirdropVault.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract KAIAirdropVaultTest is Test {
    KAIAirdropVault vault;
    MockToken token;
    address admin = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    bytes32 root;
    bytes32[] proofAlice;
    bytes32[] proofBob;

    uint256 constant ALICE_AMOUNT = 100e18;
    uint256 constant BOB_AMOUNT = 50e18;
    uint256 constant COOLDOWN = 3600;

    function setUp() public {
        token = new MockToken();
        vault = new KAIAirdropVault(address(token), COOLDOWN);

        // Build a two-leaf Merkle tree: (alice, ALICE_AMOUNT), (bob, BOB_AMOUNT).
        // OpenZeppelin sorts (a, b) → (min, max) at every level during verify,
        // so build the tree the same sorted way.
        bytes32 leafAlice = leaf(alice, ALICE_AMOUNT);
        bytes32 leafBob = leaf(bob, BOB_AMOUNT);

        bytes32 lo = leafAlice < leafBob ? leafAlice : leafBob;
        bytes32 hi = leafAlice < leafBob ? leafBob : leafAlice;
        root = keccak256(abi.encodePacked(lo, hi));

        // Alice's proof is [Bob's leaf], Bob's proof is [Alice's leaf].
        proofAlice = new bytes32[](1);
        proofAlice[0] = leafBob;
        proofBob = new bytes32[](1);
        proofBob[0] = leafAlice;

        vault.setMerkleRoot(root);
        token.mint(address(vault), ALICE_AMOUNT + BOB_AMOUNT);
    }

    function leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(abi.encode(account, amount));
    }

    function test_AdminCanSetRoot() public view {
        assertEq(vault.merkleRoot(), root);
    }

    function test_ClaimAlice() public {
        vm.prank(alice);
        vault.claim(ALICE_AMOUNT, proofAlice);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
        assertEq(vault.claimed(alice), ALICE_AMOUNT);
    }

    function test_ClaimBob() public {
        vm.prank(bob);
        vault.claim(BOB_AMOUNT, proofBob);
        assertEq(token.balanceOf(bob), BOB_AMOUNT);
        assertEq(vault.claimed(bob), BOB_AMOUNT);
    }

    function test_DoubleClaimReverts() public {
        vm.startPrank(alice);
        vault.claim(ALICE_AMOUNT, proofAlice);
        vm.expectRevert(abi.encodeWithSelector(KAIAirdropVault.AlreadyClaimed.selector, alice));
        vault.claim(ALICE_AMOUNT, proofAlice);
        vm.stopPrank();
    }

    function test_InvalidProofReverts() public {
        // alice tries to claim bob's amount with alice's proof
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(KAIAirdropVault.NotEligible.selector, alice));
        vault.claim(BOB_AMOUNT, proofAlice);
    }

    function test_WrongLeafReverts() public {
        // bob's amount is 50e18; claiming 51e18 is not in the tree.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(KAIAirdropVault.NotEligible.selector, bob));
        vault.claim(51e18, proofBob);
    }

    function test_CooldownBlocksRapidRootChange() public {
        bytes32 newRoot = keccak256("new");
        // Should fail because cooldown (3600s) hasn't elapsed since start
        vm.expectRevert();
        vault.setMerkleRoot(newRoot);
    }

    function test_RootChangeAfterCooldown() public {
        vm.warp(block.timestamp + COOLDOWN);
        bytes32 newRoot = keccak256("new");
        vault.setMerkleRoot(newRoot);
        assertEq(vault.merkleRoot(), newRoot);
    }

    function test_OnlyRootSetterCanSetRoot() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setMerkleRoot(keccak256("x"));
    }

    function test_PauseBlocksClaim() public {
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(KAIAirdropVault.PausedError.selector);
        vault.claim(ALICE_AMOUNT, proofAlice);
    }

    function test_UnpauseAllowsClaim() public {
        vault.pause();
        vault.unpause();
        vm.prank(alice);
        vault.claim(ALICE_AMOUNT, proofAlice);
        assertEq(token.balanceOf(alice), ALICE_AMOUNT);
    }

    function test_AdminWithdraw() public {
        // Mint extra tokens beyond the allocations and ensure admin can sweep them.
        token.mint(address(vault), 10e18);
        uint256 before = token.balanceOf(admin);
        vault.withdraw(admin);
        // The whole vault balance (160e18 = 150e18 allocations + 10e18 extra) is swept.
        assertEq(token.balanceOf(admin) - before, 160e18);
    }

    function test_GrantDirect() public {
        token.mint(address(vault), 25e18);
        vault.grant(bob, 25e18);
        assertEq(token.balanceOf(bob), 25e18);
    }
}
