// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPriceOracle
/// @notice Sentinel's normalized price oracle surface.
/// @dev Returns the USD price of `asset` scaled to 18 decimals, regardless of
///      the underlying feed's native precision. Reverts on stale or invalid
///      data — callers must never receive a silent zero.
interface IPriceOracle {
    /// @return priceUSD18 Price of one whole unit of `asset` in USD, 18-decimal scale.
    function getAssetPrice(address asset) external view returns (uint256 priceUSD18);
}
