// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SToken } from "../lending/SToken.sol";

/// @title ILendingPool
/// @notice Sentinel's interest-free, multi-reserve lending pool.
interface ILendingPool {
    /// @dev Basis points: 10_000 == 100%.
    struct ReserveConfig {
        bool isActive;
        bool canBeCollateral;
        bool canBeBorrowed;
        uint16 liquidationThresholdBps;
        uint16 liquidationBonusBps;
        uint16 closeFactorBps;
        IERC20 underlying;
        SToken sToken;
        uint8 underlyingDecimals;
    }

    event ReserveAdded(address indexed asset, address sToken);
    event ReserveConfigUpdated(address indexed asset);
    event Deposit(address indexed user, address indexed asset, uint256 amount);
    event Withdraw(address indexed user, address indexed asset, uint256 amount);
    event Borrow(address indexed user, address indexed asset, uint256 amount);
    event Repay(address indexed user, address indexed asset, uint256 amount, address payer);
    event Liquidation(
        address indexed user,
        address indexed liquidator,
        address indexed collateralAsset,
        address debtAsset,
        uint256 debtCovered,
        uint256 collateralSeized
    );

    function deposit(address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function borrow(address asset, uint256 amount) external;
    function repay(address asset, uint256 amount, address onBehalfOf) external;
    function liquidate(
        address user,
        address collateralAsset,
        address debtAsset,
        uint256 debtToCover
    )
        external;

    function healthFactor(address user) external view returns (uint256);
    function totalCollateralValueUSD18(address user) external view returns (uint256);
    function totalDebtValueUSD18(address user) external view returns (uint256);
    function reserveConfig(address asset) external view returns (ReserveConfig memory);
    function reserveList() external view returns (address[] memory);
}
