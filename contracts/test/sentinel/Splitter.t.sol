// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../../src/sentinel/Reputation.sol";
import { Splitter } from "../../src/sentinel/Splitter.sol";
import { MintableERC20 } from "../../src/lending/MintableERC20.sol";

contract SplitterTest is Test {
    AgentRegistry internal registry;
    Reputation internal reputation;
    Splitter internal splitter;
    MintableERC20 internal token;

    address internal owner = makeAddr("owner");
    address internal coord = makeAddr("coord");
    address internal treasury = makeAddr("treasury");

    address internal opW = makeAddr("opWatcher");
    address internal opS = makeAddr("opScorer");
    address internal opR = makeAddr("opRouter");
    address internal opE = makeAddr("opExecutor");

    uint256 internal idW;
    uint256 internal idS;
    uint256 internal idR;
    uint256 internal idE;

    function setUp() public {
        registry = new AgentRegistry();
        reputation = new Reputation(owner, registry, 100, 50);
        vm.prank(owner);
        reputation.setCoordinator(coord);

        splitter = new Splitter(owner, registry, reputation, treasury, 6_000, 3_000, 1_000);
        vm.prank(owner);
        splitter.setCoordinator(coord);

        token = new MintableERC20("Sentinel WETH", "WETH", 18, owner);

        vm.prank(opW);
        idW = registry.register(AgentRegistry.Role.Watcher, "w");
        vm.prank(opS);
        idS = registry.register(AgentRegistry.Role.Scorer, "s");
        vm.prank(opR);
        idR = registry.register(AgentRegistry.Role.Router, "r");
        vm.prank(opE);
        idE = registry.register(AgentRegistry.Role.Executor, "e");
    }

    function _settle(uint256 amount) internal {
        vm.prank(owner);
        token.mintTo(address(splitter), amount);

        uint256[] memory ids = new uint256[](4);
        ids[0] = idW;
        ids[1] = idS;
        ids[2] = idR;
        ids[3] = idE;

        vm.prank(coord);
        splitter.settle(ids, IERC20(address(token)), amount);
    }

    function test_constructorRejectsBadShares() public {
        vm.expectRevert(
            abi.encodeWithSelector(Splitter.SharesDoNotSumToTotal.selector, 6_000, 3_000, 999)
        );
        new Splitter(owner, registry, reputation, treasury, 6_000, 3_000, 999);
    }

    function test_settleSplitsExactlyAccordingToShares() public {
        uint256 amount = 10_000 ether;
        _settle(amount);

        // 60/30/10 of 10_000 = 6000 / 3000 / 1000.
        uint256 agentTotal = 6_000 ether;
        uint256 treasuryAmt = 3_000 ether;
        uint256 bountyAmt = 1_000 ether;

        assertEq(splitter.owed(IERC20(address(token)), treasury), treasuryAmt);
        assertEq(splitter.bountyBalance(IERC20(address(token))), bountyAmt);

        // No reputation yet → equal split among 4 agents = 1500 each.
        // Remainder (0) goes to first agent.
        assertEq(splitter.owed(IERC20(address(token)), opW), agentTotal / 4);
        assertEq(splitter.owed(IERC20(address(token)), opS), agentTotal / 4);
        assertEq(splitter.owed(IERC20(address(token)), opR), agentTotal / 4);
        assertEq(splitter.owed(IERC20(address(token)), opE), agentTotal / 4);
    }

    function test_settleReputationWeightedDistribution() public {
        // Watcher gets 3 prior successes, others 1 each.
        vm.startPrank(coord);
        reputation.recordSuccess(idW);
        reputation.recordSuccess(idW);
        reputation.recordSuccess(idW);
        reputation.recordSuccess(idS);
        reputation.recordSuccess(idR);
        reputation.recordSuccess(idE);
        vm.stopPrank();
        // Scores: W=300, S=100, R=100, E=100, total=600
        // Agent portion = 6000 ether * 0.5 (W) / 0.166... (others).
        // W=3000, S=1000, R=1000, E=1000. Last agent absorbs rounding.

        uint256 amount = 10_000 ether;
        _settle(amount);

        // Computed shares for each except last:
        // perAgent[i] = agentPortion * scoreOf(i) / totalScore
        // assigned along the way; last sweeps remainder.
        uint256 agentPortion = 6_000 ether;
        uint256 totalScore = 600;
        uint256 shareW = (agentPortion * 300) / totalScore;
        uint256 shareS = (agentPortion * 100) / totalScore;
        uint256 shareR = (agentPortion * 100) / totalScore;
        uint256 shareE = agentPortion - shareW - shareS - shareR;

        assertEq(splitter.owed(IERC20(address(token)), opW), shareW);
        assertEq(splitter.owed(IERC20(address(token)), opS), shareS);
        assertEq(splitter.owed(IERC20(address(token)), opR), shareR);
        assertEq(splitter.owed(IERC20(address(token)), opE), shareE);

        // The four shares plus treasury + bounty must equal the total.
        uint256 sum = shareW + shareS + shareR + shareE + 3_000 ether + 1_000 ether;
        assertEq(sum, amount);
    }

    function test_claimTransfersAndZeroesOwed() public {
        uint256 amount = 10_000 ether;
        _settle(amount);

        vm.prank(opW);
        splitter.claim(IERC20(address(token)));
        assertEq(token.balanceOf(opW), 1_500 ether);
        assertEq(splitter.owed(IERC20(address(token)), opW), 0);

        // Second claim should revert (nothing left).
        vm.expectRevert(Splitter.NothingToClaim.selector);
        vm.prank(opW);
        splitter.claim(IERC20(address(token)));
    }

    function test_treasuryClaims() public {
        _settle(10_000 ether);
        vm.prank(treasury);
        splitter.claim(IERC20(address(token)));
        assertEq(token.balanceOf(treasury), 3_000 ether);
    }

    function test_bountyHeldUntilWithdrawal() public {
        _settle(10_000 ether);
        assertEq(splitter.bountyBalance(IERC20(address(token))), 1_000 ether);

        address recipient = makeAddr("recipient");
        vm.prank(owner);
        splitter.withdrawBounty(IERC20(address(token)), recipient, 400 ether);
        assertEq(token.balanceOf(recipient), 400 ether);
        assertEq(splitter.bountyBalance(IERC20(address(token))), 600 ether);
    }

    function test_withdrawBountyCapsAtBalance() public {
        _settle(10_000 ether);
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        splitter.withdrawBounty(IERC20(address(token)), recipient, 9_999 ether);
        assertEq(token.balanceOf(recipient), 1_000 ether);
        assertEq(splitter.bountyBalance(IERC20(address(token))), 0);
    }

    function test_revert_settleNotCoordinator() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = idW;
        vm.expectRevert(
            abi.encodeWithSelector(Splitter.OnlyCoordinator.selector, address(this))
        );
        splitter.settle(ids, IERC20(address(token)), 100);
    }

    function test_revert_settleZeroAmount() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = idW;
        vm.expectRevert(Splitter.AmountZero.selector);
        vm.prank(coord);
        splitter.settle(ids, IERC20(address(token)), 0);
    }

    function test_revert_settleNoAgents() public {
        uint256[] memory ids = new uint256[](0);
        vm.expectRevert(Splitter.NoAgents.selector);
        vm.prank(coord);
        splitter.settle(ids, IERC20(address(token)), 100);
    }

    function test_revert_setSharesSumWrong() public {
        vm.expectRevert(
            abi.encodeWithSelector(Splitter.SharesDoNotSumToTotal.selector, 5_000, 3_000, 1_000)
        );
        vm.prank(owner);
        splitter.setShares(5_000, 3_000, 1_000);
    }

    function test_revert_setTreasuryZero() public {
        vm.expectRevert(Splitter.TreasuryZero.selector);
        vm.prank(owner);
        splitter.setTreasury(address(0));
    }

    function test_revert_setCoordinatorNotOwner() public {
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this))
        );
        splitter.setCoordinator(coord);
    }
}
