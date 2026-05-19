// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";

import { ILendingPool } from "../interfaces/ILendingPool.sol";
import { IPriceOracle } from "../interfaces/IPriceOracle.sol";
import { SToken } from "./SToken.sol";

/// @title LendingPool
/// @notice Interest-free, multi-reserve, oracle-priced lending pool used by
///         Sentinel. Debt amounts are static — only collateral revaluation
///         (via the price oracle) drives a position toward liquidation.
///
/// @dev Design choices:
///      * No interest accrual, no index math, no rebasing tokens. sToken
///        balances equal the user's collateral 1:1.
///      * Multi-reserve: any ERC20 can be added as a reserve and independently
///        configured as collateral-only, borrow-only, both, or disabled.
///      * Liquidation parameters (LT, bonus, close factor) are per-reserve.
///      * Per-asset debt is tracked in a plain mapping; no debt token contract.
contract LendingPool is ILendingPool, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Basis-point denominator.
    uint256 private constant BPS = 10_000;

    /// @dev Health-factor scale. HF below 1e18 is liquidatable.
    uint256 private constant HF_SCALE = 1e18;

    /// @notice Price oracle producing 18-decimal USD prices.
    IPriceOracle public immutable oracle;

    /// @notice Per-reserve configuration. `isActive == false` for unregistered.
    mapping(address asset => ReserveConfig) private _reserves;

    /// @notice Enumerable list of registered reserves.
    address[] private _reserveList;

    /// @notice User debt per asset, in underlying decimals.
    mapping(address user => mapping(address asset => uint256)) public debtOf;

    /// @notice Aggregate per-asset debt (sum across all users).
    mapping(address asset => uint256) public totalDebt;

    /* ------------------------------ Errors ------------------------------- */

    error ReserveAlreadyRegistered(address asset);
    error ReserveNotActive(address asset);
    error ReserveNotCollateral(address asset);
    error ReserveNotBorrowable(address asset);
    error AmountZero();
    error InsufficientLiquidity(address asset, uint256 requested, uint256 available);
    error InsufficientCollateral(address user, address asset, uint256 requested, uint256 balance);
    error WithdrawWouldUndercollateralize(uint256 hfAfter);
    error BorrowWouldUndercollateralize(uint256 hfAfter);
    error PositionStillHealthy(uint256 hf);
    error NothingToLiquidate();
    error CloseFactorExceeded(uint256 requested, uint256 maxAllowed);
    error SelfLiquidation();
    error ParamOutOfRange(string what, uint256 value);
    error UserHasNoCollateralOfAsset(address user, address asset);

    /* ----------------------------- Constructor --------------------------- */

    constructor(address owner_, IPriceOracle oracle_) Ownable(owner_) {
        oracle = oracle_;
    }

    /* ------------------------------ Admin -------------------------------- */

    /// @notice Registers a new reserve. Deploys the SToken contract.
    /// @param asset Underlying ERC20 address.
    /// @param canBeCollateral Whether this asset can back debt.
    /// @param canBeBorrowed Whether this asset can be borrowed against other collateral.
    /// @param liquidationThresholdBps LT — 0 if not collateral.
    /// @param liquidationBonusBps Bonus paid to liquidator out of seized collateral.
    /// @param closeFactorBps Max share of a user's debt a single liquidation may cover.
    /// @param sTokenName ERC20 name for the receipt token.
    /// @param sTokenSymbol ERC20 symbol.
    function addReserve(
        address asset,
        bool canBeCollateral,
        bool canBeBorrowed,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint16 closeFactorBps,
        string calldata sTokenName,
        string calldata sTokenSymbol
    )
        external
        onlyOwner
        returns (address sTokenAddr)
    {
        if (_reserves[asset].isActive) revert ReserveAlreadyRegistered(asset);
        _validateParams(
            canBeCollateral, liquidationThresholdBps, liquidationBonusBps, closeFactorBps
        );

        uint8 dec = IERC20Metadata(asset).decimals();
        SToken sToken = new SToken(address(this), asset, dec, sTokenName, sTokenSymbol);

        _reserves[asset] = ReserveConfig({
            isActive: true,
            canBeCollateral: canBeCollateral,
            canBeBorrowed: canBeBorrowed,
            liquidationThresholdBps: liquidationThresholdBps,
            liquidationBonusBps: liquidationBonusBps,
            closeFactorBps: closeFactorBps,
            underlying: IERC20(asset),
            sToken: sToken,
            underlyingDecimals: dec
        });
        _reserveList.push(asset);

        emit ReserveAdded(asset, address(sToken));
        return address(sToken);
    }

    /// @notice Updates risk parameters of an existing reserve.
    function setReserveParams(
        address asset,
        bool canBeCollateral,
        bool canBeBorrowed,
        uint16 liquidationThresholdBps,
        uint16 liquidationBonusBps,
        uint16 closeFactorBps
    )
        external
        onlyOwner
    {
        ReserveConfig storage r = _reserves[asset];
        if (!r.isActive) revert ReserveNotActive(asset);
        _validateParams(
            canBeCollateral, liquidationThresholdBps, liquidationBonusBps, closeFactorBps
        );
        r.canBeCollateral = canBeCollateral;
        r.canBeBorrowed = canBeBorrowed;
        r.liquidationThresholdBps = liquidationThresholdBps;
        r.liquidationBonusBps = liquidationBonusBps;
        r.closeFactorBps = closeFactorBps;
        emit ReserveConfigUpdated(asset);
    }

    function _validateParams(
        bool canBeCollateral,
        uint16 ltBps,
        uint16 lbBps,
        uint16 cfBps
    )
        private
        pure
    {
        if (canBeCollateral) {
            if (ltBps == 0 || ltBps >= BPS) revert ParamOutOfRange("liquidationThresholdBps", ltBps);
        }
        // bonus is share of debt-value added — 0..50% is a sane band
        if (lbBps > 5_000) revert ParamOutOfRange("liquidationBonusBps", lbBps);
        if (cfBps == 0 || cfBps > BPS) revert ParamOutOfRange("closeFactorBps", cfBps);
    }

    /* ------------------------------ Read --------------------------------- */

    function reserveConfig(address asset) external view returns (ReserveConfig memory) {
        return _reserves[asset];
    }

    function reserveList() external view returns (address[] memory) {
        return _reserveList;
    }

    /// @notice Returns the user's health factor in 18-decimal scale.
    /// @dev type(uint256).max if the user has no debt.
    function healthFactor(address user) public view returns (uint256) {
        uint256 debtUSD = totalDebtValueUSD18(user);
        if (debtUSD == 0) return type(uint256).max;

        uint256 collAdjustedUSD = _collateralAdjustedUSD18(user);
        return (collAdjustedUSD * HF_SCALE) / debtUSD;
    }

    function totalCollateralValueUSD18(address user) public view returns (uint256 total) {
        uint256 n = _reserveList.length;
        for (uint256 i = 0; i < n; ++i) {
            address asset = _reserveList[i];
            ReserveConfig storage r = _reserves[asset];
            if (!r.canBeCollateral) continue;
            uint256 bal = r.sToken.balanceOf(user);
            if (bal == 0) continue;
            total += _toUSD18(bal, oracle.getAssetPrice(asset), r.underlyingDecimals);
        }
    }

    function totalDebtValueUSD18(address user) public view returns (uint256 total) {
        uint256 n = _reserveList.length;
        for (uint256 i = 0; i < n; ++i) {
            address asset = _reserveList[i];
            uint256 amt = debtOf[user][asset];
            if (amt == 0) continue;
            ReserveConfig storage r = _reserves[asset];
            total += _toUSD18(amt, oracle.getAssetPrice(asset), r.underlyingDecimals);
        }
    }

    /// @dev Collateral value weighted by per-asset LT — used as the HF numerator.
    function _collateralAdjustedUSD18(address user) internal view returns (uint256 total) {
        uint256 n = _reserveList.length;
        for (uint256 i = 0; i < n; ++i) {
            address asset = _reserveList[i];
            ReserveConfig storage r = _reserves[asset];
            if (!r.canBeCollateral) continue;
            uint256 bal = r.sToken.balanceOf(user);
            if (bal == 0) continue;
            uint256 valUSD = _toUSD18(bal, oracle.getAssetPrice(asset), r.underlyingDecimals);
            total += (valUSD * r.liquidationThresholdBps) / BPS;
        }
    }

    /* ----------------------------- User flow ----------------------------- */

    function deposit(address asset, uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        ReserveConfig storage r = _reserves[asset];
        if (!r.isActive) revert ReserveNotActive(asset);

        r.underlying.safeTransferFrom(msg.sender, address(this), amount);
        r.sToken.mint(msg.sender, amount);

        emit Deposit(msg.sender, asset, amount);
    }

    function withdraw(address asset, uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        ReserveConfig storage r = _reserves[asset];
        if (!r.isActive) revert ReserveNotActive(asset);

        uint256 sBal = r.sToken.balanceOf(msg.sender);
        if (amount > sBal) revert InsufficientCollateral(msg.sender, asset, amount, sBal);

        // Ensure pool actually has liquidity to release (some may be borrowed).
        uint256 cash = r.underlying.balanceOf(address(this));
        if (amount > cash) revert InsufficientLiquidity(asset, amount, cash);

        r.sToken.burn(msg.sender, amount);
        r.underlying.safeTransfer(msg.sender, amount);

        // Solvency post-condition: if this withdrawal removes collateral from a
        // borrower, the new HF must still be ≥ 1. For a depositor with no debt
        // this is automatically satisfied.
        if (totalDebtValueUSD18(msg.sender) > 0) {
            uint256 hf = healthFactor(msg.sender);
            if (hf < HF_SCALE) revert WithdrawWouldUndercollateralize(hf);
        }

        emit Withdraw(msg.sender, asset, amount);
    }

    function borrow(address asset, uint256 amount) external nonReentrant {
        if (amount == 0) revert AmountZero();
        ReserveConfig storage r = _reserves[asset];
        if (!r.isActive) revert ReserveNotActive(asset);
        if (!r.canBeBorrowed) revert ReserveNotBorrowable(asset);

        uint256 cash = r.underlying.balanceOf(address(this));
        if (amount > cash) revert InsufficientLiquidity(asset, amount, cash);

        debtOf[msg.sender][asset] += amount;
        totalDebt[asset] += amount;

        r.underlying.safeTransfer(msg.sender, amount);

        uint256 hf = healthFactor(msg.sender);
        if (hf < HF_SCALE) revert BorrowWouldUndercollateralize(hf);

        emit Borrow(msg.sender, asset, amount);
    }

    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    )
        external
        nonReentrant
    {
        if (amount == 0) revert AmountZero();
        ReserveConfig storage r = _reserves[asset];
        if (!r.isActive) revert ReserveNotActive(asset);

        uint256 owed = debtOf[onBehalfOf][asset];
        uint256 toRepay = amount > owed ? owed : amount;
        if (toRepay == 0) revert AmountZero();

        debtOf[onBehalfOf][asset] = owed - toRepay;
        totalDebt[asset] -= toRepay;

        r.underlying.safeTransferFrom(msg.sender, address(this), toRepay);

        emit Repay(onBehalfOf, asset, toRepay, msg.sender);
    }

    /* ----------------------------- Liquidation --------------------------- */

    /// @notice Liquidates an unhealthy position.
    /// @param user Borrower whose position is under water (HF < 1).
    /// @param collateralAsset Which of the user's collaterals to seize.
    /// @param debtAsset Which debt asset the liquidator is repaying.
    /// @param debtToCover Amount of debt the liquidator wishes to repay (in
    ///                    underlying decimals). Capped by close factor and by
    ///                    the user's available collateral.
    function liquidate(
        address user,
        address collateralAsset,
        address debtAsset,
        uint256 debtToCover
    )
        external
        nonReentrant
    {
        if (msg.sender == user) revert SelfLiquidation();
        if (debtToCover == 0) revert AmountZero();

        ReserveConfig storage rDebt = _reserves[debtAsset];
        ReserveConfig storage rColl = _reserves[collateralAsset];
        if (!rDebt.isActive) revert ReserveNotActive(debtAsset);
        if (!rColl.isActive) revert ReserveNotActive(collateralAsset);
        if (!rColl.canBeCollateral) revert ReserveNotCollateral(collateralAsset);

        uint256 hf = healthFactor(user);
        if (hf >= HF_SCALE) revert PositionStillHealthy(hf);

        uint256 userDebt = debtOf[user][debtAsset];
        if (userDebt == 0) revert NothingToLiquidate();

        uint256 maxAllowedByCloseFactor = (userDebt * rDebt.closeFactorBps) / BPS;
        if (debtToCover > maxAllowedByCloseFactor) {
            revert CloseFactorExceeded(debtToCover, maxAllowedByCloseFactor);
        }

        uint256 userCollateral = rColl.sToken.balanceOf(user);
        if (userCollateral == 0) revert UserHasNoCollateralOfAsset(user, collateralAsset);

        (uint256 finalDebtCovered, uint256 collateralSeized) = _computeLiquidationAmounts(
            debtToCover, userCollateral, rDebt, rColl
        );

        // Effects
        debtOf[user][debtAsset] = userDebt - finalDebtCovered;
        totalDebt[debtAsset] -= finalDebtCovered;
        rColl.sToken.burn(user, collateralSeized);

        // Interactions
        rDebt.underlying.safeTransferFrom(msg.sender, address(this), finalDebtCovered);
        rColl.underlying.safeTransfer(msg.sender, collateralSeized);

        emit Liquidation(
            user, msg.sender, collateralAsset, debtAsset, finalDebtCovered, collateralSeized
        );
    }

    /// @dev Determines (a) the actual debt covered and (b) collateral seized,
    ///      accounting for the bonus and capping at the user's available
    ///      collateral balance. When the request exceeds available collateral
    ///      the function caps both sides proportionally.
    function _computeLiquidationAmounts(
        uint256 debtToCover,
        uint256 userCollateral,
        ReserveConfig storage rDebt,
        ReserveConfig storage rColl
    )
        private
        view
        returns (uint256 finalDebtCovered, uint256 collateralSeized)
    {
        uint256 priceDebt = oracle.getAssetPrice(address(rDebt.underlying));
        uint256 priceColl = oracle.getAssetPrice(address(rColl.underlying));

        // Step 1: USD value of debt the liquidator proposes to repay.
        uint256 debtCoveredUSD18 = _toUSD18(debtToCover, priceDebt, rDebt.underlyingDecimals);

        // Step 2: USD value of collateral to seize = debt + bonus.
        uint256 collateralUSD18 =
            (debtCoveredUSD18 * (BPS + rColl.liquidationBonusBps)) / BPS;

        // Step 3: convert collateral USD value to collateral amount.
        uint256 collateralAmount =
            _fromUSD18(collateralUSD18, priceColl, rColl.underlyingDecimals);

        if (collateralAmount <= userCollateral) {
            return (debtToCover, collateralAmount);
        }

        // Cap path: insufficient collateral to satisfy the request. Seize all
        // collateral, recompute the matching debtCovered.
        collateralSeized = userCollateral;
        uint256 cappedCollateralUSD18 =
            _toUSD18(userCollateral, priceColl, rColl.underlyingDecimals);
        uint256 cappedDebtUSD18 = (cappedCollateralUSD18 * BPS) / (BPS + rColl.liquidationBonusBps);
        finalDebtCovered = _fromUSD18(cappedDebtUSD18, priceDebt, rDebt.underlyingDecimals);
    }

    /* --------------------------- Math helpers ---------------------------- */

    /// @dev value (raw underlying units) * price18 / 10^underlyingDecimals → USD18
    function _toUSD18(
        uint256 amount,
        uint256 priceUSD18,
        uint8 decimals
    )
        internal
        pure
        returns (uint256)
    {
        return (amount * priceUSD18) / (10 ** decimals);
    }

    /// @dev valueUSD18 * 10^underlyingDecimals / price18 → raw underlying units
    function _fromUSD18(
        uint256 valueUSD18,
        uint256 priceUSD18,
        uint8 decimals
    )
        internal
        pure
        returns (uint256)
    {
        return (valueUSD18 * (10 ** decimals)) / priceUSD18;
    }
}
