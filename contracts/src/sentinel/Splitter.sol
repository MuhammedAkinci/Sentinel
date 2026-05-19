// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { AgentRegistry } from "./AgentRegistry.sol";
import { Reputation } from "./Reputation.sol";

/// @title Splitter
/// @notice Receives liquidation proceeds from the Coordinator and distributes
///         them across three tranches:
///           - agents (default 60%), reputation-weighted across the case's
///             four participants;
///           - treasury (default 30%), accruing to a single configured
///             address;
///           - bounty pool (default 10%), held in this contract for future
///             distribution to community-submitted specialist agents.
/// @dev Pull-payment pattern: settle() records owed balances; participants
///      claim() on their own schedule. This eliminates re-entrancy and
///      gas-griefing exposure on the settlement path.
contract Splitter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant TOTAL_BPS = 10_000;

    AgentRegistry public immutable registry;
    Reputation public immutable reputation;

    address public coordinator;
    address public treasury;

    uint16 public agentShareBps;
    uint16 public treasuryShareBps;
    uint16 public bountyShareBps;

    /// @notice Token-denominated balances owed to each account.
    mapping(IERC20 token => mapping(address account => uint256)) public owed;

    /// @notice Per-token bounty pool balance — not yet claimable; held
    ///         pending a community-distribution policy in a later release.
    mapping(IERC20 token => uint256) public bountyBalance;

    event CoordinatorUpdated(address indexed previous, address indexed current);
    event TreasuryUpdated(address indexed previous, address indexed current);
    event SharesUpdated(uint16 agentBps, uint16 treasuryBps, uint16 bountyBps);
    event Settled(
        IERC20 indexed token,
        uint256 amount,
        uint256 agentPortion,
        uint256 treasuryPortion,
        uint256 bountyPortion
    );
    event Claimed(address indexed account, IERC20 indexed token, uint256 amount);
    event BountyWithdrawn(IERC20 indexed token, address indexed to, uint256 amount);

    error OnlyCoordinator(address caller);
    error CoordinatorZero();
    error TreasuryZero();
    error SharesDoNotSumToTotal(uint16 agent, uint16 treasury, uint16 bounty);
    error NoAgents();
    error AmountZero();
    error NothingToClaim();

    modifier onlyCoordinator() {
        if (msg.sender != coordinator) revert OnlyCoordinator(msg.sender);
        _;
    }

    constructor(
        address owner_,
        AgentRegistry registry_,
        Reputation reputation_,
        address treasury_,
        uint16 agentShareBps_,
        uint16 treasuryShareBps_,
        uint16 bountyShareBps_
    )
        Ownable(owner_)
    {
        if (treasury_ == address(0)) revert TreasuryZero();
        registry = registry_;
        reputation = reputation_;
        treasury = treasury_;
        _setShares(agentShareBps_, treasuryShareBps_, bountyShareBps_);
    }

    /* ------------------------------ Admin -------------------------------- */

    function setCoordinator(address newCoordinator) external onlyOwner {
        if (newCoordinator == address(0)) revert CoordinatorZero();
        emit CoordinatorUpdated(coordinator, newCoordinator);
        coordinator = newCoordinator;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert TreasuryZero();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    function setShares(
        uint16 agentBps,
        uint16 treasuryBps,
        uint16 bountyBps
    )
        external
        onlyOwner
    {
        _setShares(agentBps, treasuryBps, bountyBps);
    }

    function _setShares(uint16 agentBps, uint16 treasuryBps, uint16 bountyBps) private {
        if (uint256(agentBps) + treasuryBps + bountyBps != TOTAL_BPS) {
            revert SharesDoNotSumToTotal(agentBps, treasuryBps, bountyBps);
        }
        agentShareBps = agentBps;
        treasuryShareBps = treasuryBps;
        bountyShareBps = bountyBps;
        emit SharesUpdated(agentBps, treasuryBps, bountyBps);
    }

    /* ----------------------------- Settle path --------------------------- */

    /// @notice Settles `amount` of `token` across the configured shares.
    /// @dev Caller (the Coordinator) MUST transfer the tokens to this
    ///      contract before invoking settle. This function only records
    ///      claims; it does not pull.
    function settle(
        uint256[] calldata agentIds,
        IERC20 token,
        uint256 amount
    )
        external
        onlyCoordinator
    {
        if (amount == 0) revert AmountZero();
        if (agentIds.length == 0) revert NoAgents();

        uint256 agentPortion = (amount * agentShareBps) / TOTAL_BPS;
        uint256 treasuryPortion = (amount * treasuryShareBps) / TOTAL_BPS;
        uint256 bountyPortion = amount - agentPortion - treasuryPortion;

        owed[token][treasury] += treasuryPortion;
        bountyBalance[token] += bountyPortion;

        _distributeAgents(agentIds, token, agentPortion);

        emit Settled(token, amount, agentPortion, treasuryPortion, bountyPortion);
    }

    function _distributeAgents(
        uint256[] calldata agentIds,
        IERC20 token,
        uint256 agentPortion
    )
        private
    {
        uint256 n = agentIds.length;
        uint256 totalScore = 0;
        for (uint256 i = 0; i < n; ++i) {
            totalScore += reputation.scoreOf(agentIds[i]);
        }

        if (totalScore == 0) {
            // No reputation yet — split equally; rounding remainder accrues to
            // the first agent so the full agentPortion is accounted for.
            uint256 perAgent = agentPortion / n;
            uint256 remainder = agentPortion - perAgent * n;
            for (uint256 i = 0; i < n; ++i) {
                address op = registry.operatorOf(agentIds[i]);
                uint256 share = i == 0 ? perAgent + remainder : perAgent;
                owed[token][op] += share;
            }
            return;
        }

        uint256 assigned = 0;
        for (uint256 i = 0; i < n; ++i) {
            uint256 share;
            if (i == n - 1) {
                share = agentPortion - assigned; // sweep remainder
            } else {
                share = (agentPortion * reputation.scoreOf(agentIds[i])) / totalScore;
                assigned += share;
            }
            owed[token][registry.operatorOf(agentIds[i])] += share;
        }
    }

    /* ------------------------------ Claim -------------------------------- */

    function claim(IERC20 token) external nonReentrant {
        uint256 amount = owed[token][msg.sender];
        if (amount == 0) revert NothingToClaim();
        owed[token][msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, token, amount);
    }

    /* ----------------------------- Bounty -------------------------------- */

    /// @notice Owner can withdraw bounty funds — used by a future community
    ///         agent distribution policy. Today this is the operational
    ///         escape hatch for the treasury multisig.
    function withdrawBounty(IERC20 token, address to, uint256 amount) external onlyOwner {
        if (amount > bountyBalance[token]) amount = bountyBalance[token];
        if (amount == 0) revert AmountZero();
        bountyBalance[token] -= amount;
        token.safeTransfer(to, amount);
        emit BountyWithdrawn(token, to, amount);
    }
}
