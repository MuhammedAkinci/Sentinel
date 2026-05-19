// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Deploy } from "../../script/Deploy.s.sol";

import { MintableERC20 } from "../../src/lending/MintableERC20.sol";
import { PriceOracleAdapter } from "../../src/lending/PriceOracleAdapter.sol";
import { LendingPool } from "../../src/lending/LendingPool.sol";
import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../../src/sentinel/Reputation.sol";
import { Splitter } from "../../src/sentinel/Splitter.sol";
import { Coordinator } from "../../src/sentinel/Coordinator.sol";
import { AutoProtectionVault } from "../../src/consumer/AutoProtectionVault.sol";

/// @title DeployTest
/// @notice Executes the production deployment script in-VM (no broadcast)
///         and verifies that every contract is wired up correctly.
contract DeployTest is Test {
    Deploy internal deployScript;
    address internal deployer;
    address internal treasury = makeAddr("treasury");
    address internal somniaAgentsPlatform = makeAddr("somniaAgentsPlatform");

    function setUp() public {
        deployScript = new Deploy();
        // In a real `forge script --broadcast` run, every nested call is
        // automatically broadcast as the deployer's EOA, so the script
        // owns nothing intermediate. In a foundry test there is no such
        // propagation — the script contract itself is the caller for
        // every nested config call, so we make it the configured
        // deployer here. This proves the wiring; ownership-transfer
        // semantics are exercised by PROD broadcast at deploy time.
        deployer = address(deployScript);
    }

    function _defaultConfig() internal returns (Deploy.DeploymentConfig memory cfg) {
        cfg = Deploy.DeploymentConfig({
            deployer: deployer,
            treasury: treasury,
            somniaAgentsPlatform: somniaAgentsPlatform,
            wethLtBps: 7_500,
            wethLbBps: 500,
            wethCfBps: 5_000,
            usdcCfBps: 5_000,
            reputationSuccessReward: 100,
            reputationFailurePenalty: 50,
            agentShareBps: 6_000,
            treasuryShareBps: 3_000,
            bountyShareBps: 1_000,
            scoreThreshold: 5_000,
            perRequestDeposit: 0.12 ether,
            oracleStalenessThreshold: 1 days,
            initialEthPriceUSD18: 3_000e18,
            initialUsdcPriceUSD18: 1e18,
            enablePublicFaucet: true,
            wethFaucetCap: 100 ether,
            usdcFaucetCap: 100_000e6,
            lockOracleOverrides: false,
            deployVault: true,
            vaultOwner: makeAddr("vaultOwner"),
            vaultMetadataURI: "ipfs://vault"
        });
    }

    /* --------------------------- Testnet path ---------------------------- */

    function test_testnetDeploymentWiresEverything() public {
        Deploy.DeploymentConfig memory cfg = _defaultConfig();
        Deploy.Deployment memory d = deployScript.deployAll(cfg);

        // All addresses populated.
        assertTrue(d.weth != address(0));
        assertTrue(d.usdc != address(0));
        assertTrue(d.oracle != address(0));
        assertTrue(d.pool != address(0));
        assertTrue(d.sWeth != address(0));
        assertTrue(d.sUsdc != address(0));
        assertTrue(d.registry != address(0));
        assertTrue(d.reputation != address(0));
        assertTrue(d.splitter != address(0));
        assertTrue(d.coordinator != address(0));
        assertTrue(d.vault != address(0));

        // Token configuration.
        MintableERC20 weth = MintableERC20(d.weth);
        MintableERC20 usdc = MintableERC20(d.usdc);
        assertEq(weth.decimals(), 18);
        assertEq(usdc.decimals(), 6);
        assertEq(weth.owner(), deployer);
        assertEq(usdc.owner(), deployer);

        // Public faucet enabled on testnet.
        assertTrue(weth.publicMintEnabled());
        assertEq(weth.publicMintCap(), cfg.wethFaucetCap);
        assertTrue(usdc.publicMintEnabled());
        assertEq(usdc.publicMintCap(), cfg.usdcFaucetCap);

        // Oracle: overrides set, NOT locked.
        PriceOracleAdapter oracle = PriceOracleAdapter(d.oracle);
        (uint256 ethOverride, bool ethActive) = oracle.overrides(d.weth);
        assertEq(ethOverride, cfg.initialEthPriceUSD18);
        assertTrue(ethActive);
        (uint256 usdcOverride, bool usdcActive) = oracle.overrides(d.usdc);
        assertEq(usdcOverride, cfg.initialUsdcPriceUSD18);
        assertTrue(usdcActive);
        assertFalse(oracle.overridesLocked());
        assertEq(oracle.stalenessThreshold(), cfg.oracleStalenessThreshold);

        // Pool reserves.
        LendingPool pool = LendingPool(d.pool);
        LendingPool.ReserveConfig memory rWeth = pool.reserveConfig(d.weth);
        assertTrue(rWeth.isActive);
        assertTrue(rWeth.canBeCollateral);
        assertFalse(rWeth.canBeBorrowed);
        assertEq(rWeth.liquidationThresholdBps, cfg.wethLtBps);
        assertEq(rWeth.liquidationBonusBps, cfg.wethLbBps);
        assertEq(rWeth.closeFactorBps, cfg.wethCfBps);
        assertEq(address(rWeth.sToken), d.sWeth);

        LendingPool.ReserveConfig memory rUsdc = pool.reserveConfig(d.usdc);
        assertFalse(rUsdc.canBeCollateral);
        assertTrue(rUsdc.canBeBorrowed);
        assertEq(address(rUsdc.sToken), d.sUsdc);

        // Sentinel layer wiring.
        Reputation reputation = Reputation(d.reputation);
        assertEq(reputation.coordinator(), d.coordinator);
        assertEq(reputation.successReward(), cfg.reputationSuccessReward);
        assertEq(reputation.failurePenalty(), cfg.reputationFailurePenalty);

        Splitter splitter = Splitter(d.splitter);
        assertEq(splitter.coordinator(), d.coordinator);
        assertEq(splitter.treasury(), treasury);
        assertEq(splitter.agentShareBps(), cfg.agentShareBps);
        assertEq(splitter.treasuryShareBps(), cfg.treasuryShareBps);
        assertEq(splitter.bountyShareBps(), cfg.bountyShareBps);

        Coordinator coordinator = Coordinator(payable(d.coordinator));
        assertEq(address(coordinator.lendingPool()), d.pool);
        assertEq(address(coordinator.registry()), d.registry);
        assertEq(address(coordinator.reputation()), d.reputation);
        assertEq(address(coordinator.splitter()), d.splitter);
        assertEq(address(coordinator.somniaAgents()), somniaAgentsPlatform);
        assertEq(coordinator.scoreThreshold(), cfg.scoreThreshold);
        assertEq(coordinator.perRequestDeposit(), cfg.perRequestDeposit);

        // Vault: registered as a Watcher in AgentRegistry, owner set.
        AutoProtectionVault vault = AutoProtectionVault(d.vault);
        assertEq(vault.owner(), cfg.vaultOwner);
        AgentRegistry registry = AgentRegistry(d.registry);
        AgentRegistry.Agent memory a = registry.getAgent(vault.watcherAgentId());
        assertEq(a.operator, address(vault));
        assertEq(uint8(a.role), uint8(AgentRegistry.Role.Watcher));
        assertEq(a.metadataURI, cfg.vaultMetadataURI);
    }

    /* --------------------------- Mainnet path ---------------------------- */

    function test_mainnetConfigLocksOraclesAndSkipsFaucet() public {
        Deploy.DeploymentConfig memory cfg = _defaultConfig();
        // Mirror the mainnet branch of _loadConfigFromEnv.
        cfg.initialEthPriceUSD18 = 0;
        cfg.initialUsdcPriceUSD18 = 0;
        cfg.enablePublicFaucet = false;
        cfg.wethFaucetCap = 0;
        cfg.usdcFaucetCap = 0;
        cfg.lockOracleOverrides = true;

        Deploy.Deployment memory d = deployScript.deployAll(cfg);

        // Faucet OFF.
        assertFalse(MintableERC20(d.weth).publicMintEnabled());
        assertFalse(MintableERC20(d.usdc).publicMintEnabled());

        // Override lock IS engaged.
        assertTrue(PriceOracleAdapter(d.oracle).overridesLocked());

        // Override calls revert after lock — verify with a representative attempt.
        // Caller must be the owner (the script contract acting as deployer in test mode).
        vm.expectRevert(PriceOracleAdapter.OverridesPermanentlyLocked.selector);
        vm.prank(address(deployScript));
        PriceOracleAdapter(d.oracle).setOverridePrice(d.weth, 1);
    }

    function test_deploymentWithoutVault() public {
        Deploy.DeploymentConfig memory cfg = _defaultConfig();
        cfg.deployVault = false;

        Deploy.Deployment memory d = deployScript.deployAll(cfg);

        assertEq(d.vault, address(0));
    }
}
