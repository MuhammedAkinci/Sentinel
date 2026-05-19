// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { AgentRegistry } from "./AgentRegistry.sol";

/// @title Reputation
/// @notice Tracks per-agent performance for use by the Splitter when
///         computing reputation-weighted payouts.
/// @dev Score updates are gated to the Coordinator address. The owner can
///      reconfigure the reward / penalty constants and rotate the
///      Coordinator address. Scores are clamped at zero — they never go
///      negative; an agent that accumulates too many failures earns nothing
///      from the agent payout tranche but does not penalize its peers.
contract Reputation is Ownable2Step {
    struct Score {
        uint64 successes;
        uint64 failures;
        uint128 score;
    }

    AgentRegistry public immutable registry;

    address public coordinator;
    uint128 public successReward;
    uint128 public failurePenalty;

    mapping(uint256 agentId => Score) private _scores;

    event CoordinatorUpdated(address indexed previous, address indexed current);
    event RewardsUpdated(uint128 successReward, uint128 failurePenalty);
    event SuccessRecorded(uint256 indexed agentId, uint128 newScore);
    event FailureRecorded(uint256 indexed agentId, uint128 newScore);

    error OnlyCoordinator(address caller);
    error CoordinatorZero();
    error AgentNotRegistered(uint256 agentId);

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert OnlyCoordinator(msg.sender);
        _;
    }

    constructor(
        address owner_,
        AgentRegistry registry_,
        uint128 successReward_,
        uint128 failurePenalty_
    )
        Ownable(owner_)
    {
        registry = registry_;
        successReward = successReward_;
        failurePenalty = failurePenalty_;
        emit RewardsUpdated(successReward_, failurePenalty_);
    }

    /* ------------------------------ Admin -------------------------------- */

    function setCoordinator(address newCoordinator) external onlyOwner {
        if (newCoordinator == address(0)) revert CoordinatorZero();
        emit CoordinatorUpdated(coordinator, newCoordinator);
        coordinator = newCoordinator;
    }

    function setRewards(uint128 successReward_, uint128 failurePenalty_) external onlyOwner {
        successReward = successReward_;
        failurePenalty = failurePenalty_;
        emit RewardsUpdated(successReward_, failurePenalty_);
    }

    /* ------------------------- Coordinator writes ------------------------ */

    function recordSuccess(uint256 agentId) external onlyCoordinator {
        _requireRegistered(agentId);
        Score storage s = _scores[agentId];
        s.successes += 1;
        s.score += successReward;
        emit SuccessRecorded(agentId, s.score);
    }

    function recordFailure(uint256 agentId) external onlyCoordinator {
        _requireRegistered(agentId);
        Score storage s = _scores[agentId];
        s.failures += 1;
        uint128 penalty = failurePenalty;
        s.score = s.score > penalty ? s.score - penalty : 0;
        emit FailureRecorded(agentId, s.score);
    }

    /* ------------------------------ Reads -------------------------------- */

    function scoreOf(uint256 agentId) external view returns (uint128) {
        return _scores[agentId].score;
    }

    function performanceOf(uint256 agentId) external view returns (Score memory) {
        return _scores[agentId];
    }

    function _requireRegistered(uint256 agentId) private view {
        // Throws AgentNotFound if the registry has no such ID — propagate as
        // our local error for clearer call-site diagnostics.
        try registry.operatorOf(agentId) returns (address) {
            return;
        } catch {
            revert AgentNotRegistered(agentId);
        }
    }
}
