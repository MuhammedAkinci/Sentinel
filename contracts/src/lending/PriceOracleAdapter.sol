// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IPriceOracle } from "../interfaces/IPriceOracle.sol";
import { IAggregatorV3 } from "../interfaces/IAggregatorV3.sol";

/// @title PriceOracleAdapter
/// @notice Routes Sentinel's normalized price requests to per-asset
///         Chainlink-compatible feeds (Protofire on Shannon testnet, DIA on
///         mainnet) and exposes a testnet-only manual override used by the
///         demo to trigger oracle-driven liquidations.
///
/// @dev Mainnet safety mechanism: `lockOverrides()` is a one-way switch.
///      Once invoked, `setOverridePrice` and `clearOverride` permanently
///      revert. Production deployments call `lockOverrides()` immediately
///      after construction; testnet deployments leave it unlocked so the
///      Sentinel demo can simulate market crashes.
contract PriceOracleAdapter is IPriceOracle, Ownable2Step {
    /// @notice Maximum age, in seconds, an oracle answer may have before it is
    ///         treated as stale and reverted.
    uint256 public stalenessThreshold;

    /// @notice Per-asset feed registration.
    struct FeedConfig {
        IAggregatorV3 feed;
        uint8 feedDecimals;
        bool registered;
    }

    mapping(address asset => FeedConfig) public feeds;

    /// @notice Per-asset price override. Used only in testnet demos.
    struct Override {
        uint256 priceUSD18;
        bool active;
    }

    mapping(address asset => Override) public overrides;

    /// @notice One-way: once true, override functions are permanently disabled.
    bool public overridesLocked;

    event FeedRegistered(address indexed asset, address indexed feed, uint8 feedDecimals);
    event FeedRemoved(address indexed asset);
    event StalenessThresholdUpdated(uint256 oldValue, uint256 newValue);
    event OverrideSet(address indexed asset, uint256 priceUSD18);
    event OverrideCleared(address indexed asset);
    event OverridesLocked();

    error FeedNotRegistered(address asset);
    error FeedAnswerInvalid(address asset, int256 answer);
    error FeedAnswerStale(address asset, uint256 updatedAt, uint256 currentTime);
    error OverridesAlreadyLocked();
    error OverridesPermanentlyLocked();
    error StalenessThresholdZero();
    error FeedAddressZero();

    constructor(address owner_, uint256 stalenessThreshold_) Ownable(owner_) {
        if (stalenessThreshold_ == 0) revert StalenessThresholdZero();
        stalenessThreshold = stalenessThreshold_;
    }

    /* ----------------------------- Admin: feeds ---------------------------- */

    function registerFeed(address asset, IAggregatorV3 feed) external onlyOwner {
        if (address(feed) == address(0)) revert FeedAddressZero();
        uint8 feedDecimals = feed.decimals();
        feeds[asset] = FeedConfig({ feed: feed, feedDecimals: feedDecimals, registered: true });
        emit FeedRegistered(asset, address(feed), feedDecimals);
    }

    function removeFeed(address asset) external onlyOwner {
        delete feeds[asset];
        emit FeedRemoved(asset);
    }

    function setStalenessThreshold(uint256 newThreshold) external onlyOwner {
        if (newThreshold == 0) revert StalenessThresholdZero();
        emit StalenessThresholdUpdated(stalenessThreshold, newThreshold);
        stalenessThreshold = newThreshold;
    }

    /* --------------------------- Admin: overrides -------------------------- */

    /// @notice Sets a manual price override for `asset`, in 18-decimal USD.
    /// @dev Reverts permanently once `lockOverrides()` is called. Used by the
    ///      Sentinel demo on Shannon testnet to simulate price crashes.
    function setOverridePrice(address asset, uint256 priceUSD18) external onlyOwner {
        if (overridesLocked) revert OverridesPermanentlyLocked();
        overrides[asset] = Override({ priceUSD18: priceUSD18, active: true });
        emit OverrideSet(asset, priceUSD18);
    }

    function clearOverride(address asset) external onlyOwner {
        if (overridesLocked) revert OverridesPermanentlyLocked();
        delete overrides[asset];
        emit OverrideCleared(asset);
    }

    /// @notice One-way: permanently disables override capability. After this
    ///         call, prices flow exclusively from registered feeds.
    function lockOverrides() external onlyOwner {
        if (overridesLocked) revert OverridesAlreadyLocked();
        overridesLocked = true;
        emit OverridesLocked();
    }

    /* ------------------------------ Read path ----------------------------- */

    /// @inheritdoc IPriceOracle
    function getAssetPrice(address asset) external view returns (uint256 priceUSD18) {
        Override memory ov = overrides[asset];
        if (ov.active) return ov.priceUSD18;

        FeedConfig memory cfg = feeds[asset];
        if (!cfg.registered) revert FeedNotRegistered(asset);

        (, int256 answer,, uint256 updatedAt,) = cfg.feed.latestRoundData();
        if (answer <= 0) revert FeedAnswerInvalid(asset, answer);
        if (block.timestamp > updatedAt + stalenessThreshold) {
            revert FeedAnswerStale(asset, updatedAt, block.timestamp);
        }

        return _scaleTo18(uint256(answer), cfg.feedDecimals);
    }

    function _scaleTo18(uint256 value, uint8 fromDecimals) internal pure returns (uint256) {
        if (fromDecimals == 18) return value;
        if (fromDecimals < 18) return value * (10 ** (18 - fromDecimals));
        return value / (10 ** (fromDecimals - 18));
    }
}
