// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiEscrow} from "./KaiEscrow.sol";
import {KaiAgentRegistry} from "./KaiAgentRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken4 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract KaiEscrowTest is Test {
    KaiEscrow escrow;
    KaiAgentRegistry registry;
    MockToken4 token;
    address treasury = makeAddr("treasury");
    address provider = makeAddr("provider");
    address payer = makeAddr("payer");
    address agentAddr = makeAddr("agent");
    address alice = makeAddr("alice");
    uint256 constant AMOUNT = 100e18;

    function setUp() public {
        registry = new KaiAgentRegistry();
        escrow = new KaiEscrow(address(registry), treasury);
        token = new MockToken4("Mock", "MOCK");

        registry.registerAgent(
            agentAddr, "Test Agent", "Desc", "https://x.com",
            "{}", 1000 ether, 100 ether
        );

        token.mint(payer, AMOUNT * 10);
    }

    function test_Deposit() public {
        bytes32 paymentRef = keccak256("test-payment");
        uint256 autoRelease = 3600;

        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        bytes32 escrowId = escrow.deposit(
            paymentRef, provider, agentAddr, address(token), AMOUNT, autoRelease, "Test service"
        );
        vm.stopPrank();

        assertEq(token.balanceOf(address(escrow)), AMOUNT);

        KaiEscrow.EscrowRecord memory e = escrow.getEscrow(escrowId);
        assertEq(e.escrowId, escrowId);
        assertEq(e.payer, payer);
        assertEq(e.provider, provider);
        assertEq(e.token, address(token));
        assertEq(e.amount, AMOUNT);
    }

    function test_DepositZeroAmount() public {
        vm.expectRevert(KaiEscrow.ZeroAmount.selector);
        escrow.deposit(
            keccak256("ref"), provider, agentAddr, address(token), 0, 3600, "Service"
        );
    }

    function test_DepositInactiveAgent() public {
        address fakeAgent = makeAddr("fakeAgent");
        vm.expectRevert(KaiEscrow.AgentNotActive.selector);
        escrow.deposit(
            keccak256("ref"), provider, fakeAgent, address(token), AMOUNT, 3600, "Service"
        );
    }

    function test_Release() public {
        bytes32 paymentRef = keccak256("test-payment");

        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        bytes32 escrowId = escrow.deposit(
            paymentRef, provider, agentAddr, address(token), AMOUNT, 3600, "Service"
        );
        vm.stopPrank();

        uint256 providerBalBefore = token.balanceOf(provider);
        uint256 treasuryBalBefore = token.balanceOf(treasury);

        vm.prank(payer);
        escrow.release(escrowId);

        uint256 providerBalAfter = token.balanceOf(provider);
        uint256 treasuryBalAfter = token.balanceOf(treasury);

        assertGt(providerBalAfter, providerBalBefore, "Provider should receive funds");
        assertGt(treasuryBalAfter, treasuryBalBefore, "Treasury should receive fee");
    }

    function test_Refund() public {
        bytes32 paymentRef = keccak256("test-payment");
        uint256 autoRelease = 3600;

        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        bytes32 escrowId = escrow.deposit(
            paymentRef, provider, agentAddr, address(token), AMOUNT, autoRelease, "Service"
        );
        vm.stopPrank();

        uint256 payerBalBefore = token.balanceOf(payer);

        vm.prank(payer);
        escrow.refund(escrowId);

        uint256 payerBalAfter = token.balanceOf(payer);
        assertEq(payerBalAfter, payerBalBefore + AMOUNT, "Full refund");
    }

    function test_RefundNotPayer() public {
        bytes32 paymentRef = keccak256("test-payment");

        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        bytes32 escrowId = escrow.deposit(
            paymentRef, provider, agentAddr, address(token), AMOUNT, 3600, "Service"
        );
        vm.stopPrank();

        vm.prank(alice);
        vm.expectRevert(KaiEscrow.NotPayer.selector);
        escrow.refund(escrowId);
    }

    function test_RefundExpired() public {
        bytes32 paymentRef = keccak256("test-payment");
        uint256 autoRelease = 60;

        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        bytes32 escrowId = escrow.deposit(
            paymentRef, provider, agentAddr, address(token), AMOUNT, autoRelease, "Service"
        );
        vm.stopPrank();

        vm.warp(block.timestamp + autoRelease + 1);

        vm.prank(payer);
        vm.expectRevert(KaiEscrow.AutoReleaseExpired.selector);
        escrow.refund(escrowId);
    }

    function test_SetFee() public {
        escrow.setFee(50);
        assertEq(escrow.feeBps(), 50);
    }

    function test_SetFeeMaxExceeded() public {
        vm.expectRevert(KaiEscrow.InvalidFee.selector);
        escrow.setFee(101);
    }

    function test_EscrowCount() public {
        assertEq(escrow.escrowCount(), 0);

        bytes32 paymentRef = keccak256("test-payment");
        vm.startPrank(payer);
        token.approve(address(escrow), AMOUNT);
        escrow.deposit(paymentRef, provider, agentAddr, address(token), AMOUNT, 3600, "Service");
        vm.stopPrank();

        assertEq(escrow.escrowCount(), 1);
    }
}
