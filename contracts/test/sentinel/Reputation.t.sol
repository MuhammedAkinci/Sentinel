// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../../src/sentinel/Reputation.sol";

contract ReputationTest is Test {
    AgentRegistry internal registry;
    Reputation internal reputation;

    address internal owner = makeAddr("owner");
    address internal coord = makeAddr("coord");
    address internal opA = makeAddr("opA");
    address internal stranger = makeAddr("stranger");

    uint128 internal constant REWARD = 100;
    uint128 internal constant PENALTY = 50;

    uint256 internal aId;

    function setUp() public {
        registry = new AgentRegistry();
        reputation = new Reputation(owner, registry, REWARD, PENALTY);

        vm.prank(owner);
        reputation.setCoordinator(coord);

        vm.prank(opA);
        aId = registry.register(AgentRegistry.Role.Watcher, "ipfs://a");
    }

    function test_initialScoreIsZero() public view {
        assertEq(reputation.scoreOf(aId), 0);
    }

    function test_recordSuccessAddsReward() public {
        vm.prank(coord);
        reputation.recordSuccess(aId);
        assertEq(reputation.scoreOf(aId), REWARD);
        Reputation.Score memory s = reputation.performanceOf(aId);
        assertEq(s.successes, 1);
        assertEq(s.failures, 0);
    }

    function test_recordFailureSubtractsPenaltyAndClampsAtZero() public {
        vm.startPrank(coord);
        reputation.recordSuccess(aId); // +100 → 100
        reputation.recordFailure(aId); // -50 → 50
        reputation.recordFailure(aId); // -50 → 0
        reputation.recordFailure(aId); // -50 → still 0 (clamp)
        vm.stopPrank();

        assertEq(reputation.scoreOf(aId), 0);
        Reputation.Score memory s = reputation.performanceOf(aId);
        assertEq(s.successes, 1);
        assertEq(s.failures, 3);
    }

    function test_revert_recordSuccessNotCoordinator() public {
        vm.expectRevert(abi.encodeWithSelector(Reputation.OnlyCoordinator.selector, stranger));
        vm.prank(stranger);
        reputation.recordSuccess(aId);
    }

    function test_revert_recordSuccessAgentNotRegistered() public {
        vm.expectRevert(abi.encodeWithSelector(Reputation.AgentNotRegistered.selector, 999));
        vm.prank(coord);
        reputation.recordSuccess(999);
    }

    function test_setRewardsUpdatesValues() public {
        vm.prank(owner);
        reputation.setRewards(200, 25);
        assertEq(reputation.successReward(), 200);
        assertEq(reputation.failurePenalty(), 25);
    }

    function test_revert_setCoordinatorZero() public {
        vm.expectRevert(Reputation.CoordinatorZero.selector);
        vm.prank(owner);
        reputation.setCoordinator(address(0));
    }

    function test_revert_setRewardsNotOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        reputation.setRewards(1, 1);
    }
}
