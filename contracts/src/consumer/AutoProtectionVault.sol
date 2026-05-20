// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { ILendingPool } from "../interfaces/ILendingPool.sol";
import { AgentRegistry } from "../sentinel/AgentRegistry.sol";
import { Coordinator } from "../sentinel/Coordinator.sol";

/// @title AutoProtectionVault
/// @notice Minimal third-party consumer that demonstrates Sentinel's
///         composability: a vault that wraps a single user's lending
///         position and registers itself as a Sentinel Watcher so that
///         anyone (the user, a keeper, the user's frontend) can trigger
///         a Sentinel-mediated liquidation of the vault's own position
///         once it becomes unhealthy.
/// @dev The vault auto-registers a Watcher agent in its constructor and
///      owns the resulting agent ID for its lifetime. The vault is the
///      operator of that agent — so when it calls
///      `coordinator.flagPosition(watcherAgentId, address(this), ...)`,
///      the Coordinator's ownership check passes.
contract AutoProtectionVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    ILendingPool public immutable lendingPool;
    Coordinator public immutable coordinator;
    IERC20 public immutable collateralAsset;
    IERC20 public immutable debtAsset;
    uint256 public immutable watcherAgentId;

    event Deposited(uint256 amount);
    event Borrowed(uint256 amount);
    event Repaid(uint256 amount);
    event Withdrawn(uint256 amount);
    event SentinelProtectionRequested(uint256 indexed caseId);

    error OnlyOwner(address caller);
    error AmountZero();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner(msg.sender);
        _;
    }

    constructor(
        address owner_,
        ILendingPool lendingPool_,
        Coordinator coordinator_,
        AgentRegistry registry_,
        IERC20 collateralAsset_,
        IERC20 debtAsset_,
        string memory metadataURI_
    ) {
        owner = owner_;
        lendingPool = lendingPool_;
        coordinator = coordinator_;
        collateralAsset = collateralAsset_;
        debtAsset = debtAsset_;
        watcherAgentId = registry_.register(AgentRegistry.Role.Watcher, metadataURI_);
    }

    /// @notice Pulls collateral from the owner and supplies it to the pool.
    function deposit(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert AmountZero();
        collateralAsset.safeTransferFrom(msg.sender, address(this), amount);
        collateralAsset.forceApprove(address(lendingPool), amount);
        lendingPool.deposit(address(collateralAsset), amount);
        emit Deposited(amount);
    }

    /// @notice Borrows debt asset from the pool and forwards to the owner.
    function borrow(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert AmountZero();
        lendingPool.borrow(address(debtAsset), amount);
        debtAsset.safeTransfer(msg.sender, amount);
        emit Borrowed(amount);
    }

    /// @notice Pulls debt asset from owner and repays the vault's loan.
    function repay(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert AmountZero();
        debtAsset.safeTransferFrom(msg.sender, address(this), amount);
        debtAsset.forceApprove(address(lendingPool), amount);
        lendingPool.repay(address(debtAsset), amount, address(this));
        emit Repaid(amount);
    }

    /// @notice Withdraws collateral from the pool and forwards to owner.
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0) revert AmountZero();
        lendingPool.withdraw(address(collateralAsset), amount);
        collateralAsset.safeTransfer(msg.sender, amount);
        emit Withdrawn(amount);
    }

    /// @notice Permissionless: anyone can ask Sentinel to liquidate this
    ///         vault if its on-chain health factor is below 1. The caller
    ///         supplies the Scorer prompt payload because the underlying
    ///         Somnia base agent (currently `llm-inference`) expects an
    ///         agent-specific ABI rather than a fixed Sentinel shape.
    ///         Coordinator forwards the payload as-is.
    /// @param scorerPayload Bytes already ABI-encoded for the configured
    ///        Scorer agent. The off-chain helper in
    ///        `packages/agents/src/prompts/scorer.ts` is the reference
    ///        builder; any compatible bytes are accepted.
    function requestSentinelProtection(
        bytes calldata scorerPayload
    )
        external
        nonReentrant
        returns (uint256 caseId)
    {
        caseId = coordinator.flagPosition(
            watcherAgentId,
            address(this),
            address(collateralAsset),
            address(debtAsset),
            scorerPayload
        );
        emit SentinelProtectionRequested(caseId);
    }
}
