// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../../src/sentinel/Reputation.sol";
import { Splitter } from "../../src/sentinel/Splitter.sol";
import { Coordinator } from "../../src/sentinel/Coordinator.sol";

import { LendingPool } from "../../src/lending/LendingPool.sol";
import { SToken } from "../../src/lending/SToken.sol";
import { MintableERC20 } from "../../src/lending/MintableERC20.sol";
import { PriceOracleAdapter } from "../../src/lending/PriceOracleAdapter.sol";
import { ISomniaAgents } from "../../src/interfaces/somnia/ISomniaAgents.sol";

/// @notice End-to-end Coordinator coverage. Uses vm.mockCall to intercept
///         createRequest on the Somnia native platform (no mock contract
///         deployed) and vm.prank(somniaPlatform) to deliver callbacks.
contract CoordinatorTest is Test {
    /* ----------------------------- Network ------------------------------- */

    // The Somnia native platform address on Shannon testnet. The actual
    // contract is not deployed in this test environment; vm.mockCall
    // intercepts every call into it.
    address internal constant SOMNIA_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;

    uint256 internal constant SCORER_SOMNIA_ID = 1001;
    uint256 internal constant ROUTER_SOMNIA_ID = 1002;
    uint256 internal constant SCORER_REQ_ID = 5001;
    uint256 internal constant ROUTER_REQ_ID = 5002;

    uint256 internal constant PER_REQUEST_DEPOSIT = 0.12 ether;
    uint256 internal constant SCORE_THRESHOLD = 5_000;

    /* ----------------------------- Actors -------------------------------- */

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice"); // borrower
    address internal bob = makeAddr("bob"); // USDC supplier
    address internal treasury = makeAddr("treasury");

    address internal opW = makeAddr("opWatcher");
    address internal opS = makeAddr("opScorer");
    address internal opR = makeAddr("opRouter");
    address internal opE = makeAddr("opExecutor");

    /* ----------------------------- Deployments --------------------------- */

    MintableERC20 internal weth;
    MintableERC20 internal usdc;
    PriceOracleAdapter internal oracle;
    LendingPool internal pool;
    SToken internal sWeth;

    AgentRegistry internal registry;
    Reputation internal reputation;
    Splitter internal splitter;
    Coordinator internal coordinator;

    uint256 internal idW;
    uint256 internal idS;
    uint256 internal idR;
    uint256 internal idE;

    function setUp() public virtual {
        // Tokens
        weth = new MintableERC20("Sentinel WETH", "WETH", 18, owner);
        usdc = new MintableERC20("Sentinel USDC", "USDC", 6, owner);

        // Oracle
        oracle = new PriceOracleAdapter(owner, 1 days);
        vm.startPrank(owner);
        oracle.setOverridePrice(address(weth), 3_000e18);
        oracle.setOverridePrice(address(usdc), 1e18);
        vm.stopPrank();

        // Lending pool
        pool = new LendingPool(owner, oracle);
        vm.startPrank(owner);
        address sWethAddr =
            pool.addReserve(address(weth), true, false, 7_500, 500, 5_000, "sWETH", "sWETH");
        pool.addReserve(address(usdc), false, true, 0, 0, 5_000, "sUSDC", "sUSDC");
        vm.stopPrank();
        sWeth = SToken(sWethAddr);

        // Sentinel layer
        registry = new AgentRegistry();
        reputation = new Reputation(owner, registry, 100, 50);
        splitter = new Splitter(owner, registry, reputation, treasury, 6_000, 3_000, 1_000);

        coordinator = new Coordinator(
            owner,
            ISomniaAgents(SOMNIA_PLATFORM),
            pool,
            registry,
            reputation,
            splitter,
            SCORE_THRESHOLD,
            PER_REQUEST_DEPOSIT
        );

        // Wire authority: only Coordinator can move reputation and instruct splitter.
        vm.startPrank(owner);
        reputation.setCoordinator(address(coordinator));
        splitter.setCoordinator(address(coordinator));
        coordinator.setScorerSomniaAgentId(SCORER_SOMNIA_ID);
        coordinator.setRouterSomniaAgentId(ROUTER_SOMNIA_ID);
        vm.stopPrank();

        // Register Sentinel agents
        vm.prank(opW);
        idW = registry.register(AgentRegistry.Role.Watcher, "ipfs://w");
        vm.prank(opS);
        idS = registry.register(AgentRegistry.Role.Scorer, "ipfs://s");
        vm.prank(opR);
        idR = registry.register(AgentRegistry.Role.Router, "ipfs://r");
        vm.prank(opE);
        idE = registry.register(AgentRegistry.Role.Executor, "ipfs://e");

        vm.startPrank(owner);
        coordinator.setScorerSentinelAgentId(idS);
        coordinator.setRouterSentinelAgentId(idR);
        vm.stopPrank();

        // Fund participants and the Coordinator.
        vm.startPrank(owner);
        weth.mintTo(alice, 100 ether);
        usdc.mintTo(bob, 1_000_000e6);
        usdc.mintTo(address(coordinator), 100_000e6);
        vm.stopPrank();
        vm.deal(address(coordinator), 10 ether);

        // Bob supplies USDC liquidity.
        vm.startPrank(bob);
        usdc.approve(address(pool), 500_000e6);
        pool.deposit(address(usdc), 500_000e6);
        vm.stopPrank();

        // Alice opens an under-collateralized-when-crashed position:
        //   collateral 10 WETH @ $3,000 = $30,000; LT 75% → $22,500 borrow cap
        //   borrows 15,000 USDC. HF = 22,500/15,000 = 1.5.
        vm.startPrank(alice);
        weth.approve(address(pool), 10 ether);
        pool.deposit(address(weth), 10 ether);
        pool.borrow(address(usdc), 15_000e6);
        vm.stopPrank();
    }

    /* ------------------------- Mock createRequest ------------------------ */

    /// @dev Stub createRequest to return a deterministic ID for the matching
    ///      agent ID arg. Prefix-matched against (selector, agentId, ...) so
    ///      that scorer and router calls return distinct request IDs.
    function _mockCreateRequest(uint256 agentId, uint256 reqId) internal {
        vm.mockCall(
            SOMNIA_PLATFORM,
            abi.encodeWithSelector(ISomniaAgents.createRequest.selector, agentId),
            abi.encode(reqId)
        );
    }

    function _emptyRequest() internal pure returns (ISomniaAgents.Request memory) {
        return ISomniaAgents.Request({
            id: 0,
            requester: address(0),
            callbackAddress: address(0),
            callbackSelector: bytes4(0),
            subcommittee: new address[](0),
            responses: new ISomniaAgents.Response[](0),
            responseCount: 0,
            failureCount: 0,
            threshold: 0,
            createdAt: 0,
            deadline: 0,
            status: ISomniaAgents.ResponseStatus.Success,
            consensusType: ISomniaAgents.ConsensusType.Majority,
            remainingBudget: 0,
            perAgentBudget: 0
        });
    }

    function _successResponse(bytes memory result) internal pure returns (ISomniaAgents.Response[] memory r) {
        r = new ISomniaAgents.Response[](1);
        r[0] = ISomniaAgents.Response({
            validator: address(0xBeeF),
            result: result,
            status: ISomniaAgents.ResponseStatus.Success,
            receipt: 1,
            timestamp: 0,
            executionCost: 0
        });
    }

    function _failedResponse() internal pure returns (ISomniaAgents.Response[] memory r) {
        r = new ISomniaAgents.Response[](1);
        r[0] = ISomniaAgents.Response({
            validator: address(0xBeeF),
            result: "",
            status: ISomniaAgents.ResponseStatus.Failed,
            receipt: 1,
            timestamp: 0,
            executionCost: 0
        });
    }

    /// @dev Crash ETH price so Alice's HF drops below 1.
    function _crashEth() internal {
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), 1_800e18);
    }

    /* ----------------------------- Tests --------------------------------- */

    function test_flagPositionRecordsCaseAndCallsSomnia() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);

        vm.expectCall(
            SOMNIA_PLATFORM,
            PER_REQUEST_DEPOSIT,
            abi.encodeWithSelector(
                ISomniaAgents.createRequest.selector,
                SCORER_SOMNIA_ID,
                address(coordinator),
                coordinator.handleScorerResponse.selector,
                abi.encode(alice, address(weth), address(usdc), pool.healthFactor(alice))
            )
        );
        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Flagged));
        assertEq(c.user, alice);
        assertEq(c.watcherAgentId, idW);
        assertEq(c.scoreRequestId, SCORER_REQ_ID);
        assertEq(coordinator.requestToCase(SCORER_REQ_ID), caseId);
    }

    function test_revert_flagPositionHealthy() public {
        // ETH still at $3,000 → Alice HF = 1.5.
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.expectRevert(
            abi.encodeWithSelector(Coordinator.PositionHealthy.selector, pool.healthFactor(alice))
        );
        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));
    }

    function test_revert_flagPositionWrongRole() public {
        _crashEth();
        // Executor cannot call flag.
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.AgentRoleMismatch.selector, idE, AgentRegistry.Role.Watcher
            )
        );
        vm.prank(opE);
        coordinator.flagPosition(idE, alice, address(weth), address(usdc));
    }

    function test_revert_flagPositionNotOperator() public {
        _crashEth();
        vm.expectRevert(
            abi.encodeWithSelector(Coordinator.AgentNotOwnedByCaller.selector, idW, opE)
        );
        vm.prank(opE);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));
    }

    function test_revert_flagPositionScorerIdNotSet() public {
        _crashEth();
        vm.prank(owner);
        coordinator.setScorerSomniaAgentId(0);
        vm.expectRevert(Coordinator.ScorerSomniaAgentIdNotSet.selector);
        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));
    }

    function test_scorerCallbackAdvancesToScored() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        bytes memory scoreResult = abi.encode(uint256(8_000));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(scoreResult),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Scored));
        assertEq(c.score, 8_000);
        assertEq(c.scorerAgentId, idS);
        assertEq(c.routeRequestId, ROUTER_REQ_ID);
        assertEq(coordinator.requestToCase(ROUTER_REQ_ID), caseId);
    }

    function test_scorerBelowThresholdCancels() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        bytes memory scoreResult = abi.encode(uint256(1_000)); // below 5000
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(scoreResult),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Cancelled));
        // Below-threshold is NOT a failure: scorer should not be penalised.
        assertEq(reputation.scoreOf(idS), 0);
    }

    function test_scorerFailureRecordsPenaltyAndCancels() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        // First give the Scorer some score to verify the penalty path clamps at zero.
        // Bring scorer to score=100 first via a separate completed case (would be complex).
        // Instead, just verify that a failed callback transitions to Cancelled and
        // records a failure event in the Scorer's stats.
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID, _failedResponse(), ISomniaAgents.ResponseStatus.Failed, _emptyRequest()
        );

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Cancelled));
        Reputation.Score memory s = reputation.performanceOf(idS);
        assertEq(s.failures, 1);
    }

    function test_revert_scorerCallbackNotPlatform() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        vm.expectRevert(
            abi.encodeWithSelector(Coordinator.OnlySomniaPlatform.selector, address(this))
        );
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
    }

    function test_routerCallbackAdvancesToRouted() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.LiquidationRoute memory route = Coordinator.LiquidationRoute({
            collateralAsset: address(weth),
            debtAsset: address(usdc),
            debtToCover: 7_500e6
        });
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(route)),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Routed));
        assertEq(c.route.collateralAsset, address(weth));
        assertEq(c.route.debtAsset, address(usdc));
        assertEq(c.route.debtToCover, 7_500e6);
        assertEq(c.routerAgentId, idR);
    }

    function test_revert_routerAssetMismatch() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.LiquidationRoute memory route = Coordinator.LiquidationRoute({
            collateralAsset: address(0xBAD), // mismatch
            debtAsset: address(usdc),
            debtToCover: 1
        });
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.RouteCollateralAssetMismatch.selector, address(weth), address(0xBAD)
            )
        );
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(route)),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
    }

    function test_executeRunsLiquidationDistributesAndCreditsReputation() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        Coordinator.LiquidationRoute memory route = Coordinator.LiquidationRoute({
            collateralAsset: address(weth),
            debtAsset: address(usdc),
            debtToCover: 7_500e6
        });
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(route)),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        // Execute. Coordinator pays USDC, receives WETH (with 5% bonus), forwards to Splitter.
        vm.prank(opE);
        coordinator.execute(caseId, idE);

        // Math: debtToCover=$7,500 in USDC. collateral seized =
        //   $7,500 * 1.05 / $1,800 = 4.375 WETH.
        uint256 expectedSeize = 4.375e18;

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Executed));
        assertEq(c.executorAgentId, idE);
        assertEq(c.collateralSeized, expectedSeize);

        // Splitter received the full collateral.
        assertEq(weth.balanceOf(address(splitter)), expectedSeize);

        // Splitter accounted 60/30/10 to operators+treasury+bounty.
        IERC20 t = IERC20(address(weth));
        uint256 agentPortion = (expectedSeize * 6_000) / 10_000;
        uint256 treasuryPortion = (expectedSeize * 3_000) / 10_000;
        uint256 bountyPortion = expectedSeize - agentPortion - treasuryPortion;

        // All four agents had zero reputation prior → equal split, remainder to first.
        uint256 perAgent = agentPortion / 4;
        uint256 remainder = agentPortion - perAgent * 4;
        assertEq(splitter.owed(t, opW), perAgent + remainder);
        assertEq(splitter.owed(t, opS), perAgent);
        assertEq(splitter.owed(t, opR), perAgent);
        assertEq(splitter.owed(t, opE), perAgent);
        assertEq(splitter.owed(t, treasury), treasuryPortion);
        assertEq(splitter.bountyBalance(t), bountyPortion);

        // Reputation: all four agents got one success.
        assertEq(reputation.scoreOf(idW), 100);
        assertEq(reputation.scoreOf(idS), 100);
        assertEq(reputation.scoreOf(idR), 100);
        assertEq(reputation.scoreOf(idE), 100);

        // Coordinator USDC treasury debited by debtToCover.
        assertEq(usdc.balanceOf(address(coordinator)), 100_000e6 - 7_500e6);
    }

    function test_revert_executeWrongRole() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
        Coordinator.LiquidationRoute memory route = Coordinator.LiquidationRoute({
            collateralAsset: address(weth),
            debtAsset: address(usdc),
            debtToCover: 7_500e6
        });
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(route)),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        // Watcher cannot execute.
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.AgentRoleMismatch.selector, idW, AgentRegistry.Role.Executor
            )
        );
        vm.prank(opW);
        coordinator.execute(caseId, idW);
    }

    function test_revert_executeWrongStatus() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        // Case is Flagged, not Routed.
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.WrongStatus.selector,
                caseId,
                Coordinator.CaseStatus.Routed,
                Coordinator.CaseStatus.Flagged
            )
        );
        vm.prank(opE);
        coordinator.execute(caseId, idE);
    }

    function test_revert_executeInsufficientDebtBalance() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        // Drain coordinator's USDC treasury.
        vm.prank(owner);
        coordinator.withdrawERC20(IERC20(address(usdc)), owner, 100_000e6);

        vm.prank(opW);
        uint256 caseId = coordinator.flagPosition(idW, alice, address(weth), address(usdc));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
        Coordinator.LiquidationRoute memory route = Coordinator.LiquidationRoute({
            collateralAsset: address(weth),
            debtAsset: address(usdc),
            debtToCover: 7_500e6
        });
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(route)),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.InsufficientDebtTokenBalance.selector,
                IERC20(address(usdc)),
                7_500e6,
                0
            )
        );
        vm.prank(opE);
        coordinator.execute(caseId, idE);
    }

    function test_invalidScorePayloadCancels() public {
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));

        // 16-byte result (not 32) → InvalidScorePayload.
        bytes memory badResult = hex"0123456789abcdef0123456789abcdef";
        vm.expectRevert(Coordinator.InvalidScorePayload.selector);
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(badResult),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
    }

    function test_revert_unknownRequest() public {
        vm.expectRevert(abi.encodeWithSelector(Coordinator.UnknownRequest.selector, uint256(9_999)));
        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            9_999,
            _successResponse(abi.encode(uint256(8_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );
    }

    function test_revert_insufficientNativeOnFlag() public {
        // Drain coordinator's native balance below per-request deposit.
        vm.prank(owner);
        coordinator.withdrawNative(payable(owner), 10 ether);

        _crashEth();
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.InsufficientNativeBalance.selector, PER_REQUEST_DEPOSIT, 0
            )
        );
        vm.prank(opW);
        coordinator.flagPosition(idW, alice, address(weth), address(usdc));
    }
}
