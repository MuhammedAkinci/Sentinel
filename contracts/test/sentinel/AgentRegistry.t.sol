// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry internal registry;
    address internal opA = makeAddr("opA");
    address internal opB = makeAddr("opB");

    function setUp() public {
        registry = new AgentRegistry();
    }

    function test_idsStartAtOne() public view {
        assertEq(registry.nextAgentId(), 1);
    }

    function test_registerAssignsIncrementingIds() public {
        vm.prank(opA);
        uint256 id1 = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");
        assertEq(id1, 1);

        vm.prank(opB);
        uint256 id2 = registry.register(AgentRegistry.Role.Executor, "ipfs://e1");
        assertEq(id2, 2);

        assertEq(registry.nextAgentId(), 3);
    }

    function test_registerPopulatesAgentFields() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Scorer, "ipfs://s1");
        AgentRegistry.Agent memory a = registry.getAgent(id);

        assertEq(a.id, id);
        assertEq(a.operator, opA);
        assertEq(uint8(a.role), uint8(AgentRegistry.Role.Scorer));
        assertEq(a.metadataURI, "ipfs://s1");
        assertTrue(a.active);
        assertEq(a.registeredAt, block.timestamp);
    }

    function test_registerEmitsEvent() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit AgentRegistry.AgentRegistered(1, opA, AgentRegistry.Role.Watcher, "ipfs://w1");
        vm.prank(opA);
        registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");
    }

    function test_revert_registerInvalidRole() public {
        vm.expectRevert(AgentRegistry.InvalidRole.selector);
        vm.prank(opA);
        registry.register(AgentRegistry.Role.None, "ipfs://x");
    }

    function test_revert_registerEmptyMetadata() public {
        vm.expectRevert(AgentRegistry.EmptyMetadata.selector);
        vm.prank(opA);
        registry.register(AgentRegistry.Role.Watcher, "");
    }

    function test_agentsByRoleTracksAdditions() public {
        vm.prank(opA);
        registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");
        vm.prank(opB);
        registry.register(AgentRegistry.Role.Watcher, "ipfs://w2");

        uint256[] memory watchers = registry.agentsByRole(AgentRegistry.Role.Watcher);
        assertEq(watchers.length, 2);
        assertEq(watchers[0], 1);
        assertEq(watchers[1], 2);
        assertEq(registry.agentCount(AgentRegistry.Role.Watcher), 2);
        assertEq(registry.agentCount(AgentRegistry.Role.Executor), 0);
    }

    function test_deactivateAndReactivate() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        vm.prank(opA);
        registry.deactivate(id);
        assertFalse(registry.getAgent(id).active);

        vm.prank(opA);
        registry.reactivate(id);
        assertTrue(registry.getAgent(id).active);
    }

    function test_revert_deactivateNotOperator() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotOperator.selector, id, opB));
        vm.prank(opB);
        registry.deactivate(id);
    }

    function test_revert_deactivateAlreadyInactive() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");
        vm.prank(opA);
        registry.deactivate(id);

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AlreadyInactive.selector, id));
        vm.prank(opA);
        registry.deactivate(id);
    }

    function test_revert_reactivateAlreadyActive() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AlreadyActive.selector, id));
        vm.prank(opA);
        registry.reactivate(id);
    }

    function test_updateMetadata() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        vm.prank(opA);
        registry.updateMetadata(id, "ipfs://w1-v2");
        assertEq(registry.getAgent(id).metadataURI, "ipfs://w1-v2");
    }

    function test_revert_updateMetadataNotOperator() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.NotOperator.selector, id, opB));
        vm.prank(opB);
        registry.updateMetadata(id, "ipfs://w1-v2");
    }

    function test_revert_getAgentMissing() public {
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AgentNotFound.selector, 42));
        registry.getAgent(42);
    }

    function test_isActiveAgentChecksRoleAndStatus() public {
        vm.prank(opA);
        uint256 id = registry.register(AgentRegistry.Role.Watcher, "ipfs://w1");

        assertTrue(registry.isActiveAgent(id, AgentRegistry.Role.Watcher));
        assertFalse(registry.isActiveAgent(id, AgentRegistry.Role.Executor));

        vm.prank(opA);
        registry.deactivate(id);
        assertFalse(registry.isActiveAgent(id, AgentRegistry.Role.Watcher));
    }

    function test_sameOperatorMultipleAgents() public {
        vm.startPrank(opA);
        uint256 w = registry.register(AgentRegistry.Role.Watcher, "ipfs://w");
        uint256 e = registry.register(AgentRegistry.Role.Executor, "ipfs://e");
        vm.stopPrank();

        assertEq(registry.operatorOf(w), opA);
        assertEq(registry.operatorOf(e), opA);
        assertEq(uint8(registry.getAgent(w).role), uint8(AgentRegistry.Role.Watcher));
        assertEq(uint8(registry.getAgent(e).role), uint8(AgentRegistry.Role.Executor));
    }
}
