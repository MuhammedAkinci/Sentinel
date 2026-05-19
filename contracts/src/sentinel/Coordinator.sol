// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ISomniaAgents } from "../interfaces/somnia/ISomniaAgents.sol";
import { ILendingPool } from "../interfaces/ILendingPool.sol";

import { AgentRegistry } from "./AgentRegistry.sol";
import { Reputation } from "./Reputation.sol";
import { Splitter } from "./Splitter.sol";

/// @title Coordinator
/// @notice Sentinel's on-chain orchestrator. Takes a position flag from a
///         registered Watcher, invokes the Somnia native Scorer agent,
///         consumes its consensus result, invokes the Router agent on the
///         scored output, then opens the Executor gate. Once executed, the
///         proceeds are forwarded to the Splitter and each participating
///         agent's reputation is updated.
///
/// @dev Funding model: the contract owner pre-funds the Coordinator with
///      (a) the native token (STT on Shannon, SOMI on mainnet) used to pay
///      Somnia agent deposits, and (b) the debt-token reserves used to
///      settle liquidations. The Coordinator drains debt-token reserves
///      with every executed case; the owner is expected to top them up.
contract Coordinator is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum CaseStatus {
        None,
        Flagged,
        Scored,
        Routed,
        Executed,
        Cancelled
    }

    struct LiquidationRoute {
        address collateralAsset;
        address debtAsset;
        uint256 debtToCover;
    }

    struct Case {
        uint256 id;
        address user;
        address collateralAsset;
        address debtAsset;
        uint256 watcherAgentId;
        uint256 scorerAgentId;
        uint256 routerAgentId;
        uint256 executorAgentId;
        uint256 scoreRequestId;
        uint256 routeRequestId;
        uint256 score;
        LiquidationRoute route;
        CaseStatus status;
        uint256 createdAt;
        uint256 collateralSeized;
    }

    /* ----------------------------- Dependencies -------------------------- */

    ISomniaAgents public immutable somniaAgents;
    ILendingPool public immutable lendingPool;
    AgentRegistry public immutable registry;
    Reputation public immutable reputation;
    Splitter public immutable splitter;

    /* ----------------------------- Configuration ------------------------- */

    /// @notice Somnia native agent IDs invoked via createRequest.
    /// @dev Settable so we can swap between the public `llm-inference` base
    ///      agent and our own registered custom agents without redeploying.
    uint256 public scorerSomniaAgentId;
    uint256 public routerSomniaAgentId;

    /// @notice Sentinel AgentRegistry IDs used for reputation crediting and
    ///         payout. These represent the operator that runs the agent in
    ///         the Sentinel network — distinct from the Somnia validator
    ///         subcommittee that executes a request.
    uint256 public scorerSentinelAgentId;
    uint256 public routerSentinelAgentId;

    /// @notice Minimum Scorer output for a case to proceed to routing.
    ///         Scores below this threshold cancel the case.
    uint256 public scoreThreshold;

    /// @notice Per-request Somnia deposit. Computed off-chain via
    ///         `somniaAgents.getRequestDeposit()` and mirrored here for
    ///         gas savings; admin may override.
    uint256 public perRequestDeposit;

    /* -------------------------------- State ------------------------------ */

    uint256 public nextCaseId = 1;

    mapping(uint256 caseId => Case) private _cases;
    mapping(uint256 requestId => uint256 caseId) public requestToCase;
    mapping(uint256 caseId => uint256 executorAgentId) private _executorClaim;

    /* -------------------------------- Events ----------------------------- */

    event ScorerSomniaAgentIdUpdated(uint256 previous, uint256 current);
    event RouterSomniaAgentIdUpdated(uint256 previous, uint256 current);
    event ScorerSentinelAgentIdUpdated(uint256 previous, uint256 current);
    event RouterSentinelAgentIdUpdated(uint256 previous, uint256 current);
    event ScoreThresholdUpdated(uint256 previous, uint256 current);
    event PerRequestDepositUpdated(uint256 previous, uint256 current);

    event PositionFlagged(
        uint256 indexed caseId,
        address indexed user,
        uint256 indexed watcherAgentId,
        uint256 scoreRequestId
    );
    event Scored(uint256 indexed caseId, uint256 score, uint256 routeRequestId);
    event Routed(uint256 indexed caseId, address collateralAsset, address debtAsset, uint256 debtToCover);
    event CaseCancelled(uint256 indexed caseId, bytes reason);
    event Executed(
        uint256 indexed caseId,
        uint256 indexed executorAgentId,
        uint256 debtCovered,
        uint256 collateralSeized
    );

    event NativeReceived(address indexed from, uint256 amount);
    event NativeWithdrawn(address indexed to, uint256 amount);

    /* -------------------------------- Errors ----------------------------- */

    error OnlySomniaPlatform(address caller);
    error CaseNotFound(uint256 caseId);
    error WrongStatus(uint256 caseId, CaseStatus expected, CaseStatus actual);
    error UnknownRequest(uint256 requestId);
    error AgentNotActive(uint256 agentId);
    error AgentRoleMismatch(uint256 agentId, AgentRegistry.Role expected);
    error AgentNotOwnedByCaller(uint256 agentId, address caller);
    error PositionHealthy(uint256 healthFactor);
    error InsufficientNativeBalance(uint256 required, uint256 available);
    error InsufficientDebtTokenBalance(IERC20 token, uint256 required, uint256 available);
    error InvalidScorePayload();
    error InvalidRoutePayload();
    error RouteCollateralAssetMismatch(address expected, address actual);
    error RouteDebtAssetMismatch(address expected, address actual);
    error ScorerSomniaAgentIdNotSet();
    error RouterSomniaAgentIdNotSet();
    error ScorerSentinelAgentIdNotSet();
    error RouterSentinelAgentIdNotSet();

    /* ----------------------------- Constructor --------------------------- */

    constructor(
        address owner_,
        ISomniaAgents somniaAgents_,
        ILendingPool lendingPool_,
        AgentRegistry registry_,
        Reputation reputation_,
        Splitter splitter_,
        uint256 scoreThreshold_,
        uint256 perRequestDeposit_
    )
        Ownable(owner_)
    {
        somniaAgents = somniaAgents_;
        lendingPool = lendingPool_;
        registry = registry_;
        reputation = reputation_;
        splitter = splitter_;
        scoreThreshold = scoreThreshold_;
        perRequestDeposit = perRequestDeposit_;
    }

    /* ------------------------------ Admin -------------------------------- */

    function setScorerSomniaAgentId(uint256 newId) external onlyOwner {
        emit ScorerSomniaAgentIdUpdated(scorerSomniaAgentId, newId);
        scorerSomniaAgentId = newId;
    }

    function setRouterSomniaAgentId(uint256 newId) external onlyOwner {
        emit RouterSomniaAgentIdUpdated(routerSomniaAgentId, newId);
        routerSomniaAgentId = newId;
    }

    function setScorerSentinelAgentId(uint256 newId) external onlyOwner {
        emit ScorerSentinelAgentIdUpdated(scorerSentinelAgentId, newId);
        scorerSentinelAgentId = newId;
    }

    function setRouterSentinelAgentId(uint256 newId) external onlyOwner {
        emit RouterSentinelAgentIdUpdated(routerSentinelAgentId, newId);
        routerSentinelAgentId = newId;
    }

    function setScoreThreshold(uint256 newThreshold) external onlyOwner {
        emit ScoreThresholdUpdated(scoreThreshold, newThreshold);
        scoreThreshold = newThreshold;
    }

    function setPerRequestDeposit(uint256 newDeposit) external onlyOwner {
        emit PerRequestDepositUpdated(perRequestDeposit, newDeposit);
        perRequestDeposit = newDeposit;
    }

    /// @notice Withdraw the native token treasury (STT on testnet, SOMI on
    ///         mainnet). Used to recover unused Somnia agent deposits.
    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        if (amount > address(this).balance) {
            revert InsufficientNativeBalance(amount, address(this).balance);
        }
        (bool ok,) = to.call{ value: amount }("");
        require(ok, "native transfer failed");
        emit NativeWithdrawn(to, amount);
    }

    /// @notice Withdraw debt-token treasury. Used to rotate reserves.
    function withdrawERC20(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    receive() external payable {
        emit NativeReceived(msg.sender, msg.value);
    }

    /* ----------------------------- View ---------------------------------- */

    function getCase(uint256 caseId) external view returns (Case memory) {
        Case memory c = _cases[caseId];
        if (c.id == 0) revert CaseNotFound(caseId);
        return c;
    }

    /* ------------------------- Watcher entry point ----------------------- */

    /// @notice Flags an unhealthy position and kicks off the Scorer call.
    /// @param watcherAgentId The Watcher agent ID owned by msg.sender.
    /// @param user Borrower whose position is below HF=1.
    /// @param collateralAsset Collateral the Watcher proposes to seize.
    /// @param debtAsset Debt asset the Watcher proposes to repay.
    function flagPosition(
        uint256 watcherAgentId,
        address user,
        address collateralAsset,
        address debtAsset
    )
        external
        nonReentrant
        returns (uint256 caseId)
    {
        _requireOwnedAgent(watcherAgentId, msg.sender, AgentRegistry.Role.Watcher);
        if (scorerSomniaAgentId == 0) revert ScorerSomniaAgentIdNotSet();
        if (scorerSentinelAgentId == 0) revert ScorerSentinelAgentIdNotSet();

        uint256 hf = lendingPool.healthFactor(user);
        if (hf >= 1e18) revert PositionHealthy(hf);

        caseId = nextCaseId++;
        Case storage c = _cases[caseId];
        c.id = caseId;
        c.user = user;
        c.collateralAsset = collateralAsset;
        c.debtAsset = debtAsset;
        c.watcherAgentId = watcherAgentId;
        c.status = CaseStatus.Flagged;
        c.createdAt = block.timestamp;

        bytes memory payload = abi.encode(user, collateralAsset, debtAsset, hf);
        uint256 reqId = _createSomniaRequest(
            scorerSomniaAgentId, this.handleScorerResponse.selector, payload
        );
        c.scoreRequestId = reqId;
        requestToCase[reqId] = caseId;

        emit PositionFlagged(caseId, user, watcherAgentId, reqId);
    }

    /* ----------------------- Somnia callback: scorer --------------------- */

    function handleScorerResponse(
        uint256 requestId,
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request memory /* details */
    )
        external
    {
        if (msg.sender != address(somniaAgents)) revert OnlySomniaPlatform(msg.sender);

        uint256 caseId = requestToCase[requestId];
        if (caseId == 0) revert UnknownRequest(requestId);
        Case storage c = _cases[caseId];
        if (c.status != CaseStatus.Flagged) {
            revert WrongStatus(caseId, CaseStatus.Flagged, c.status);
        }

        // Mark the Sentinel Scorer agent ID for reputation purposes. The
        // Somnia native platform supplies its own validator addresses; we
        // link the case to the configured `scorerSentinelAgentId` at the
        // moment the request was created — that ID gets reputation credit.
        c.scorerAgentId = scorerSentinelAgentId;

        if (status != ISomniaAgents.ResponseStatus.Success) {
            c.status = CaseStatus.Cancelled;
            reputation.recordFailure(c.scorerAgentId);
            emit CaseCancelled(caseId, "scorer non-success");
            return;
        }

        bytes memory result = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            c.status = CaseStatus.Cancelled;
            reputation.recordFailure(c.scorerAgentId);
            emit CaseCancelled(caseId, "scorer empty result");
            return;
        }

        uint256 score = _decodeScore(result);
        c.score = score;

        if (score < scoreThreshold) {
            c.status = CaseStatus.Cancelled;
            // Below-threshold score is a legitimate finding, not a failure.
            emit CaseCancelled(caseId, "score below threshold");
            return;
        }

        c.status = CaseStatus.Scored;
        if (routerSomniaAgentId == 0) revert RouterSomniaAgentIdNotSet();
        if (routerSentinelAgentId == 0) revert RouterSentinelAgentIdNotSet();

        bytes memory payload = abi.encode(
            c.user, c.collateralAsset, c.debtAsset, score, lendingPool.healthFactor(c.user)
        );
        uint256 reqId = _createSomniaRequest(
            routerSomniaAgentId, this.handleRouterResponse.selector, payload
        );
        c.routeRequestId = reqId;
        requestToCase[reqId] = caseId;

        emit Scored(caseId, score, reqId);
    }

    /* ----------------------- Somnia callback: router --------------------- */

    function handleRouterResponse(
        uint256 requestId,
        ISomniaAgents.Response[] memory responses,
        ISomniaAgents.ResponseStatus status,
        ISomniaAgents.Request memory /* details */
    )
        external
    {
        if (msg.sender != address(somniaAgents)) revert OnlySomniaPlatform(msg.sender);

        uint256 caseId = requestToCase[requestId];
        if (caseId == 0) revert UnknownRequest(requestId);
        Case storage c = _cases[caseId];
        if (c.status != CaseStatus.Scored) {
            revert WrongStatus(caseId, CaseStatus.Scored, c.status);
        }
        c.routerAgentId = routerSentinelAgentId;

        if (status != ISomniaAgents.ResponseStatus.Success) {
            c.status = CaseStatus.Cancelled;
            reputation.recordFailure(c.routerAgentId);
            emit CaseCancelled(caseId, "router non-success");
            return;
        }

        bytes memory result = _firstSuccessfulResult(responses);
        if (result.length == 0) {
            c.status = CaseStatus.Cancelled;
            reputation.recordFailure(c.routerAgentId);
            emit CaseCancelled(caseId, "router empty result");
            return;
        }

        LiquidationRoute memory route = _decodeRoute(result);
        if (route.collateralAsset != c.collateralAsset) {
            revert RouteCollateralAssetMismatch(c.collateralAsset, route.collateralAsset);
        }
        if (route.debtAsset != c.debtAsset) {
            revert RouteDebtAssetMismatch(c.debtAsset, route.debtAsset);
        }

        c.route = route;
        c.status = CaseStatus.Routed;
        emit Routed(caseId, route.collateralAsset, route.debtAsset, route.debtToCover);
    }

    /* ---------------------------- Executor gate -------------------------- */

    /// @notice Runs the liquidation prescribed by the Router and distributes
    ///         the proceeds via the Splitter.
    function execute(uint256 caseId, uint256 executorAgentId) external nonReentrant {
        _requireOwnedAgent(executorAgentId, msg.sender, AgentRegistry.Role.Executor);

        Case storage c = _cases[caseId];
        if (c.id == 0) revert CaseNotFound(caseId);
        if (c.status != CaseStatus.Routed) {
            revert WrongStatus(caseId, CaseStatus.Routed, c.status);
        }
        c.executorAgentId = executorAgentId;

        IERC20 debt = IERC20(c.route.debtAsset);
        IERC20 coll = IERC20(c.route.collateralAsset);

        uint256 debtBal = debt.balanceOf(address(this));
        if (debtBal < c.route.debtToCover) {
            revert InsufficientDebtTokenBalance(debt, c.route.debtToCover, debtBal);
        }

        debt.forceApprove(address(lendingPool), c.route.debtToCover);

        uint256 collBefore = coll.balanceOf(address(this));
        lendingPool.liquidate(c.user, c.route.collateralAsset, c.route.debtAsset, c.route.debtToCover);
        uint256 collateralSeized = coll.balanceOf(address(this)) - collBefore;
        c.collateralSeized = collateralSeized;
        c.status = CaseStatus.Executed;

        // Forward proceeds to Splitter and instruct it to settle across
        // the four agent IDs that participated in this case.
        coll.safeTransfer(address(splitter), collateralSeized);
        uint256[] memory participants = new uint256[](4);
        participants[0] = c.watcherAgentId;
        participants[1] = c.scorerAgentId;
        participants[2] = c.routerAgentId;
        participants[3] = c.executorAgentId;
        splitter.settle(participants, coll, collateralSeized);

        // Credit reputation to every agent on a successful case.
        reputation.recordSuccess(c.watcherAgentId);
        reputation.recordSuccess(c.scorerAgentId);
        reputation.recordSuccess(c.routerAgentId);
        reputation.recordSuccess(c.executorAgentId);

        emit Executed(caseId, executorAgentId, c.route.debtToCover, collateralSeized);
    }

    /* ------------------------------ Internals ---------------------------- */

    function _createSomniaRequest(
        uint256 agentId,
        bytes4 selector,
        bytes memory payload
    )
        private
        returns (uint256 requestId)
    {
        uint256 deposit = perRequestDeposit;
        if (address(this).balance < deposit) {
            revert InsufficientNativeBalance(deposit, address(this).balance);
        }
        requestId =
            somniaAgents.createRequest{ value: deposit }(agentId, address(this), selector, payload);
    }

    function _firstSuccessfulResult(ISomniaAgents.Response[] memory responses)
        private
        pure
        returns (bytes memory)
    {
        uint256 n = responses.length;
        for (uint256 i = 0; i < n; ++i) {
            if (responses[i].status == ISomniaAgents.ResponseStatus.Success) {
                return responses[i].result;
            }
        }
        return "";
    }

    function _decodeScore(bytes memory result) private pure returns (uint256) {
        if (result.length != 32) revert InvalidScorePayload();
        return abi.decode(result, (uint256));
    }

    function _decodeRoute(bytes memory result) private pure returns (LiquidationRoute memory r) {
        if (result.length != 96) revert InvalidRoutePayload();
        r = abi.decode(result, (LiquidationRoute));
    }

    function _requireOwnedAgent(
        uint256 agentId,
        address caller,
        AgentRegistry.Role expectedRole
    )
        private
        view
    {
        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        if (a.operator != caller) revert AgentNotOwnedByCaller(agentId, caller);
        if (a.role != expectedRole) revert AgentRoleMismatch(agentId, expectedRole);
        if (!a.active) revert AgentNotActive(agentId);
    }
}
