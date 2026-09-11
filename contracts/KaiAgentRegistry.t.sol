// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KaiAgentRegistry} from "./KaiAgentRegistry.sol";

contract KaiAgentRegistryTest is Test {
    KaiAgentRegistry registry;
    address owner = address(this);
    address alice = makeAddr("alice");
    address agent = makeAddr("agent");

    function setUp() public {
        registry = new KaiAgentRegistry();
    }

    function test_RegisterAgent() public {
        string memory did = registry.registerAgent(
            agent,
            "Test Agent",
            "A test agent",
            "https://example.com",
            '{"capabilities":true}',
            1 ether,
            0.1 ether
        );

        assertTrue(registry.isAgentActive(agent));
        assertEq(uint8(registry.getTrustLevel(agent)), uint8(KaiAgentRegistry.TrustLevel.REGISTERED));
        assertGt(bytes(did).length, 0);
    }

    function test_RegisterAgentAlreadyRegistered() public {
        registry.registerAgent(agent, "Agent 1", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);

        vm.expectRevert(KaiAgentRegistry.AgentAlreadyRegistered.selector);
        registry.registerAgent(agent, "Agent 2", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);
    }

    function test_SetTrustLevel() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);

        registry.setTrustLevel(agent, KaiAgentRegistry.TrustLevel.CERTIFIED);
        assertEq(uint8(registry.getTrustLevel(agent)), uint8(KaiAgentRegistry.TrustLevel.CERTIFIED));
    }

    function test_SetTrustLevelNotOwner() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);

        vm.prank(alice);
        vm.expectRevert();
        registry.setTrustLevel(agent, KaiAgentRegistry.TrustLevel.CERTIFIED);
    }

    function test_RevokeAgent() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);

        vm.prank(alice);
        registry.registerAgent(
            makeAddr("agent2"), "Agent 2", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether
        );

        vm.prank(alice);
        registry.revokeAgent(makeAddr("agent2"));
        assertFalse(registry.isAgentActive(makeAddr("agent2")));
    }

    function test_CheckAndRecordSpend() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 0.5 ether);

        registry.checkAndRecordSpend(agent, 0.5 ether);
        assertEq(registry.dailySpent(agent), 0.5 ether);
    }

    function test_CheckAndRecordSpendPerTxLimit() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 10 ether, 1 ether);

        vm.expectRevert();
        registry.checkAndRecordSpend(agent, 2 ether);
    }

    function test_CheckAndRecordSpendDailyLimit() public {
        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 10 ether);

        registry.checkAndRecordSpend(agent, 0.6 ether);
        registry.checkAndRecordSpend(agent, 0.3 ether);

        vm.expectRevert();
        registry.checkAndRecordSpend(agent, 0.2 ether);
    }

    function test_AgentCount() public {
        assertEq(registry.agentCount(), 0);

        registry.registerAgent(agent, "Agent", "Desc", "https://x.com", "{}", 1 ether, 0.1 ether);
        assertEq(registry.agentCount(), 1);
    }
}
