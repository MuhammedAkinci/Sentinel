// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IAggregatorV3
/// @notice Chainlink-compatible price feed interface.
/// @dev On Somnia Shannon testnet, Protofire deploys Chainlink-compatible feeds.
///      Verified addresses (Shannon testnet, 50312):
///        ETH/USD:  0x604CF5063eC760A78d1C089AA55dFf29B90937f9
///        BTC/USD:  0x3dF17dbaa3BA861D03772b501ADB343B4326C676
///        USDC/USD: 0xA4a08Eb26f85A53d40E3f908B406b2a69B1A2441
///      DIA's adapter on Somnia also exposes this same surface.
interface IAggregatorV3 {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function getRoundData(uint80 roundId)
        external
        view
        returns (
            uint80 retrievedRoundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
