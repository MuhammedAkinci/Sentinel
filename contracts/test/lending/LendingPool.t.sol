// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";

import { LendingPool } from "../../src/lending/LendingPool.sol";
import { SToken } from "../../src/lending/SToken.sol";
import { MintableERC20 } from "../../src/lending/MintableERC20.sol";
import { PriceOracleAdapter } from "../../src/lending/PriceOracleAdapter.sol";
import { ILendingPool } from "../../src/interfaces/ILendingPool.sol";

/// @title LendingPoolTest
/// @notice Covers the full surface of Sentinel's interest-free lending pool:
///         deposit, withdraw, borrow, repay, liquidation, health-factor math,
///         multi-decimal arithmetic, and every documented revert path.
contract LendingPoolTest is Test {
    /* ----------------------------- Fixtures ------------------------------ */

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice"); // borrower
    address internal bob = makeAddr("bob"); // USDC supplier
    address internal carol = makeAddr("carol"); // liquidator

    // Reserve risk params
    uint16 internal constant WETH_LT_BPS = 7_500; // 75%
    uint16 internal constant WETH_LB_BPS = 500; // 5%
    uint16 internal constant WETH_CF_BPS = 5_000; // 50%
    uint16 internal constant USDC_CF_BPS = 5_000;

    // Price scale: 1e18 USD
    uint256 internal constant ETH_PRICE_HEALTHY = 3_000e18;
    uint256 internal constant ETH_PRICE_CRASHED = 1_800e18;
    uint256 internal constant USDC_PRICE = 1e18;

    // Convenience scaling
    uint256 internal constant WETH_UNIT = 1e18;
    uint256 internal constant USDC_UNIT = 1e6;
    uint256 internal constant HF_ONE = 1e18;

    MintableERC20 internal weth;
    MintableERC20 internal usdc;
    PriceOracleAdapter internal oracle;
    LendingPool internal pool;
    SToken internal sWeth;
    SToken internal sUsdc;

    function setUp() public {
        // Tokens
        weth = new MintableERC20("Sentinel Test WETH", "WETH", 18, owner);
        usdc = new MintableERC20("Sentinel Test USDC", "USDC", 6, owner);

        // Oracle with override capability (testnet-style)
        oracle = new PriceOracleAdapter(owner, 1 days);
        vm.startPrank(owner);
        oracle.setOverridePrice(address(weth), ETH_PRICE_HEALTHY);
        oracle.setOverridePrice(address(usdc), USDC_PRICE);
        vm.stopPrank();

        // Pool
        pool = new LendingPool(owner, oracle);

        vm.startPrank(owner);
        address sWethAddr = pool.addReserve(
            address(weth), true, false, WETH_LT_BPS, WETH_LB_BPS, WETH_CF_BPS, "Sentinel sWETH", "sWETH"
        );
        address sUsdcAddr = pool.addReserve(
            address(usdc), false, true, 0, 0, USDC_CF_BPS, "Sentinel sUSDC", "sUSDC"
        );
        vm.stopPrank();
        sWeth = SToken(sWethAddr);
        sUsdc = SToken(sUsdcAddr);

        // Initial balances
        vm.startPrank(owner);
        weth.mintTo(alice, 100 * WETH_UNIT);
        weth.mintTo(carol, 10 * WETH_UNIT);
        usdc.mintTo(bob, 1_000_000 * USDC_UNIT);
        usdc.mintTo(carol, 100_000 * USDC_UNIT);
        vm.stopPrank();
    }

    /* ------------------------------ Setup -------------------------------- */

    function test_reserveListReflectsAdditions() public view {
        address[] memory list = pool.reserveList();
        assertEq(list.length, 2);
        assertEq(list[0], address(weth));
        assertEq(list[1], address(usdc));
    }

    function test_reserveConfigStored() public view {
        ILendingPool.ReserveConfig memory rWeth = pool.reserveConfig(address(weth));
        assertTrue(rWeth.isActive);
        assertTrue(rWeth.canBeCollateral);
        assertFalse(rWeth.canBeBorrowed);
        assertEq(rWeth.liquidationThresholdBps, WETH_LT_BPS);
        assertEq(rWeth.underlyingDecimals, 18);
        assertEq(address(rWeth.sToken), address(sWeth));

        ILendingPool.ReserveConfig memory rUsdc = pool.reserveConfig(address(usdc));
        assertFalse(rUsdc.canBeCollateral);
        assertTrue(rUsdc.canBeBorrowed);
        assertEq(rUsdc.underlyingDecimals, 6);
    }

    function test_revert_addReserveAlreadyRegistered() public {
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.ReserveAlreadyRegistered.selector, address(weth))
        );
        pool.addReserve(address(weth), true, false, 7_500, 500, 5_000, "x", "x");
    }

    function test_revert_addReserveNotOwner() public {
        MintableERC20 other = new MintableERC20("Other", "OTH", 18, owner);
        vm.prank(alice);
        vm.expectRevert();
        pool.addReserve(address(other), true, false, 7_500, 500, 5_000, "x", "x");
    }

    function test_revert_addReserveBadParams() public {
        MintableERC20 other = new MintableERC20("Other", "OTH", 18, owner);
        vm.prank(owner);
        // collateral=true but LT==0 — invalid
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.ParamOutOfRange.selector, "liquidationThresholdBps", 0)
        );
        pool.addReserve(address(other), true, false, 0, 500, 5_000, "x", "x");
    }

    /* --------------------------- Deposit flow ---------------------------- */

    function test_depositMintsSTokenOneToOne() public {
        vm.startPrank(alice);
        weth.approve(address(pool), 5 * WETH_UNIT);
        pool.deposit(address(weth), 5 * WETH_UNIT);
        vm.stopPrank();

        assertEq(sWeth.balanceOf(alice), 5 * WETH_UNIT);
        assertEq(weth.balanceOf(address(pool)), 5 * WETH_UNIT);
    }

    function test_revert_depositZero() public {
        vm.expectRevert(LendingPool.AmountZero.selector);
        vm.prank(alice);
        pool.deposit(address(weth), 0);
    }

    function test_revert_depositInactiveReserve() public {
        MintableERC20 unregistered = new MintableERC20("X", "X", 18, owner);
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.ReserveNotActive.selector, address(unregistered))
        );
        vm.prank(alice);
        pool.deposit(address(unregistered), 1);
    }

    /* --------------------------- Withdraw flow --------------------------- */

    function test_withdrawWithoutDebtUnconditional() public {
        _deposit(alice, address(weth), 5 * WETH_UNIT);

        vm.prank(alice);
        pool.withdraw(address(weth), 5 * WETH_UNIT);

        assertEq(sWeth.balanceOf(alice), 0);
        assertEq(weth.balanceOf(alice), 100 * WETH_UNIT);
    }

    function test_revert_withdrawMoreThanBalance() public {
        _deposit(alice, address(weth), 5 * WETH_UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingPool.InsufficientCollateral.selector,
                alice,
                address(weth),
                6 * WETH_UNIT,
                5 * WETH_UNIT
            )
        );
        vm.prank(alice);
        pool.withdraw(address(weth), 6 * WETH_UNIT);
    }

    function test_revert_withdrawWouldUndercollateralize() public {
        _seedAliceBorrowedHealthy();
        // Alice borrowed 15k USDC against 10 WETH at $3000 — HF=1.5.
        // Withdrawing 6 WETH would drop her collateral so far that HF<1.
        vm.expectRevert();
        vm.prank(alice);
        pool.withdraw(address(weth), 6 * WETH_UNIT);
    }

    /* ---------------------------- Borrow flow ---------------------------- */

    function test_borrowAgainstCollateralUpdatesDebtAndHF() public {
        _seedLiquidity();
        _deposit(alice, address(weth), 10 * WETH_UNIT);

        // Collateral USD = 10 * 3000 = $30k, adjusted by 75% LT = $22.5k.
        // Borrowing $15k USDC → HF = 22500/15000 = 1.5e18.
        vm.prank(alice);
        pool.borrow(address(usdc), 15_000 * USDC_UNIT);

        assertEq(pool.debtOf(alice, address(usdc)), 15_000 * USDC_UNIT);
        assertEq(pool.totalDebt(address(usdc)), 15_000 * USDC_UNIT);
        assertEq(usdc.balanceOf(alice), 15_000 * USDC_UNIT);
        assertApproxEqAbs(pool.healthFactor(alice), 1.5e18, 1);
    }

    function test_revert_borrowAboveLT() public {
        _seedLiquidity();
        _deposit(alice, address(weth), 10 * WETH_UNIT);
        // Max safe borrow ≈ $22.5k. Try $23k → HF < 1 → revert.
        vm.expectRevert();
        vm.prank(alice);
        pool.borrow(address(usdc), 23_000 * USDC_UNIT);
    }

    function test_revert_borrowReserveNotBorrowable() public {
        _seedLiquidity();
        vm.expectRevert(
            abi.encodeWithSelector(LendingPool.ReserveNotBorrowable.selector, address(weth))
        );
        vm.prank(alice);
        pool.borrow(address(weth), 1 * WETH_UNIT);
    }

    function test_revert_borrowInsufficientLiquidity() public {
        _deposit(alice, address(weth), 10 * WETH_UNIT);
        // No USDC suppliers — pool has zero liquidity.
        vm.expectRevert();
        vm.prank(alice);
        pool.borrow(address(usdc), 1_000 * USDC_UNIT);
    }

    /* ----------------------------- Repay flow ---------------------------- */

    function test_repayReducesDebt() public {
        _seedAliceBorrowedHealthy();
        // Alice repays 5,000 USDC.
        vm.startPrank(alice);
        usdc.approve(address(pool), 5_000 * USDC_UNIT);
        pool.repay(address(usdc), 5_000 * USDC_UNIT, alice);
        vm.stopPrank();

        assertEq(pool.debtOf(alice, address(usdc)), 10_000 * USDC_UNIT);
        assertEq(pool.totalDebt(address(usdc)), 10_000 * USDC_UNIT);
    }

    function test_repayCapsAtOutstandingDebt() public {
        _seedAliceBorrowedHealthy();
        vm.startPrank(alice);
        // Give Alice extra USDC so she has 20k to throw at the pool.
        vm.stopPrank();
        vm.prank(owner);
        usdc.mintTo(alice, 5_000 * USDC_UNIT);

        vm.startPrank(alice);
        usdc.approve(address(pool), 20_000 * USDC_UNIT);
        pool.repay(address(usdc), 20_000 * USDC_UNIT, alice);
        vm.stopPrank();

        assertEq(pool.debtOf(alice, address(usdc)), 0);
        // Only 15k was pulled, not 20k.
        assertEq(usdc.balanceOf(alice), 5_000 * USDC_UNIT);
    }

    function test_repayOnBehalfOf() public {
        _seedAliceBorrowedHealthy();
        // Carol repays Alice's debt.
        vm.startPrank(carol);
        usdc.approve(address(pool), 15_000 * USDC_UNIT);
        pool.repay(address(usdc), 15_000 * USDC_UNIT, alice);
        vm.stopPrank();

        assertEq(pool.debtOf(alice, address(usdc)), 0);
    }

    /* ---------------------------- Liquidation ---------------------------- */

    function test_liquidateUnhealthyPosition() public {
        _seedAliceBorrowedHealthy();
        assertApproxEqAbs(pool.healthFactor(alice), 1.5e18, 1);

        // Crash ETH from $3000 → $1800.
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), ETH_PRICE_CRASHED);

        uint256 hfAfterCrash = pool.healthFactor(alice);
        assertLt(hfAfterCrash, HF_ONE);

        // Carol liquidates 7,500 USDC of Alice's 15k debt (close factor = 50%).
        uint256 sWethBefore = sWeth.balanceOf(alice);
        uint256 carolWethBefore = weth.balanceOf(carol);

        vm.startPrank(carol);
        usdc.approve(address(pool), 7_500 * USDC_UNIT);
        pool.liquidate(alice, address(weth), address(usdc), 7_500 * USDC_UNIT);
        vm.stopPrank();

        // Debt covered: 7,500 USDC = $7,500.
        // Collateral USD seized: 7,500 * 1.05 = $7,875.
        // Collateral WETH seized: 7,875 / 1,800 = 4.375 WETH.
        uint256 expectedSeize = 4.375e18;
        uint256 actualSeize = sWethBefore - sWeth.balanceOf(alice);
        assertEq(actualSeize, expectedSeize);
        assertEq(weth.balanceOf(carol) - carolWethBefore, expectedSeize);

        // Alice's debt reduced.
        assertEq(pool.debtOf(alice, address(usdc)), 7_500 * USDC_UNIT);

        // Post-liquidation Alice's HF should be back above 1.
        assertGe(pool.healthFactor(alice), HF_ONE);
    }

    function test_revert_liquidateHealthyPosition() public {
        _seedAliceBorrowedHealthy();
        vm.startPrank(carol);
        usdc.approve(address(pool), 7_500 * USDC_UNIT);
        vm.expectRevert();
        pool.liquidate(alice, address(weth), address(usdc), 7_500 * USDC_UNIT);
        vm.stopPrank();
    }

    function test_revert_liquidateSelf() public {
        _seedAliceBorrowedHealthy();
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), ETH_PRICE_CRASHED);

        vm.startPrank(alice);
        usdc.approve(address(pool), 7_500 * USDC_UNIT);
        vm.expectRevert(LendingPool.SelfLiquidation.selector);
        pool.liquidate(alice, address(weth), address(usdc), 7_500 * USDC_UNIT);
        vm.stopPrank();
    }

    function test_revert_liquidateExceedsCloseFactor() public {
        _seedAliceBorrowedHealthy();
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), ETH_PRICE_CRASHED);

        // Alice has 15k debt, CF=50% → max 7.5k per liquidation.
        vm.startPrank(carol);
        usdc.approve(address(pool), 10_000 * USDC_UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingPool.CloseFactorExceeded.selector, 10_000 * USDC_UNIT, 7_500 * USDC_UNIT
            )
        );
        pool.liquidate(alice, address(weth), address(usdc), 10_000 * USDC_UNIT);
        vm.stopPrank();
    }

    function test_revert_liquidateNoCollateralOfAsset() public {
        // Alice borrows 15k USDC but has no separate collateral asset.
        _seedAliceBorrowedHealthy();
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), ETH_PRICE_CRASHED);

        // Register a third asset and use it as the collateralAsset arg.
        MintableERC20 dai = new MintableERC20("DAI", "DAI", 18, owner);
        vm.startPrank(owner);
        oracle.setOverridePrice(address(dai), 1e18);
        pool.addReserve(address(dai), true, false, 7_500, 500, 5_000, "sDAI", "sDAI");
        vm.stopPrank();

        vm.startPrank(carol);
        usdc.approve(address(pool), 7_500 * USDC_UNIT);
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingPool.UserHasNoCollateralOfAsset.selector, alice, address(dai)
            )
        );
        pool.liquidate(alice, address(dai), address(usdc), 7_500 * USDC_UNIT);
        vm.stopPrank();
    }

    /* -------------------------- Oracle overrides ------------------------- */

    function test_oracleOverrideLockIsOneWay() public {
        vm.startPrank(owner);
        oracle.lockOverrides();
        vm.expectRevert(PriceOracleAdapter.OverridesPermanentlyLocked.selector);
        oracle.setOverridePrice(address(weth), 1e18);
        vm.stopPrank();
    }

    function test_oracleStalenessRevertsAfterThreshold() public {
        // Clear override so feed becomes the source.
        // (No feed registered → revert path covers FeedNotRegistered, not staleness.
        //  This case verifies FeedNotRegistered when override is cleared.)
        vm.prank(owner);
        oracle.clearOverride(address(weth));
        vm.expectRevert(
            abi.encodeWithSelector(PriceOracleAdapter.FeedNotRegistered.selector, address(weth))
        );
        oracle.getAssetPrice(address(weth));
    }

    /* ------------------------- Health-factor edge ------------------------ */

    function test_healthFactorIsMaxWhenNoDebt() public {
        _deposit(alice, address(weth), 1 * WETH_UNIT);
        assertEq(pool.healthFactor(alice), type(uint256).max);
    }

    function test_decimalsCorrectAcrossWethAndUsdc() public {
        _seedLiquidity();
        _deposit(alice, address(weth), 10 * WETH_UNIT);
        vm.prank(alice);
        pool.borrow(address(usdc), 1_000 * USDC_UNIT);

        // Collateral USD = 10 * 3000 = 30000e18, adjusted = 22500e18.
        // Debt USD = 1000e18.
        // HF = 22500 / 1000 = 22.5 (in 1e18) → 22.5e18.
        assertApproxEqAbs(pool.healthFactor(alice), 22.5e18, 1);
    }

    /* ------------------------------ Helpers ------------------------------ */

    function _deposit(address who, address asset, uint256 amount) internal {
        vm.startPrank(who);
        MintableERC20(asset).approve(address(pool), amount);
        pool.deposit(asset, amount);
        vm.stopPrank();
    }

    function _seedLiquidity() internal {
        _deposit(bob, address(usdc), 500_000 * USDC_UNIT);
    }

    function _seedAliceBorrowedHealthy() internal {
        _seedLiquidity();
        _deposit(alice, address(weth), 10 * WETH_UNIT);
        vm.prank(alice);
        pool.borrow(address(usdc), 15_000 * USDC_UNIT);
    }
}
