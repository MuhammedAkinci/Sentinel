// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { console2 } from "forge-std/console2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { MintableERC20 } from "../src/lending/MintableERC20.sol";
import { PriceOracleAdapter } from "../src/lending/PriceOracleAdapter.sol";
import { LendingPool } from "../src/lending/LendingPool.sol";
import { AgentRegistry } from "../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../src/sentinel/Reputation.sol";
import { Splitter } from "../src/sentinel/Splitter.sol";
import { Coordinator } from "../src/sentinel/Coordinator.sol";
import { AutoProtectionVault } from "../src/consumer/AutoProtectionVault.sol";
import { ISomniaAgents } from "../src/interfaces/somnia/ISomniaAgents.sol";

/// @title Deploy
/// @notice Foundry deployment script for the Sentinel stack.
///
/// @dev Two entry points:
///      - `run()` reads configuration from environment variables, starts
///        a broadcast against the live network configured in `--rpc-url`,
///        deploys every contract, wires up authority, and writes the
///        resulting address bundle to `./deployments/<chain>.json`.
///      - `deployAll(DeploymentConfig)` is the pure deployment logic. It
///        is called both by `run()` and by `test/script/Deploy.t.sol`,
///        which exercises the full sequence in-VM without requiring an
///        RPC endpoint or live private key.
///
///      Chain-id-driven safety: testnet leaves manual oracle overrides
///      unlocked and enables the public ERC20 faucet so the demo can
///      simulate price crashes and mint test balances. Mainnet locks
///      overrides permanently and disables the faucet — there is no
///      runtime flag that can re-enable either.
contract Deploy is Script {
    uint256 internal constant SHANNON_TESTNET = 50_312;
    uint256 internal constant SOMNIA_MAINNET = 5_031;

    struct DeploymentConfig {
        address deployer;
        address treasury;
        address somniaAgentsPlatform;
        // Lending risk
        uint16 wethLtBps;
        uint16 wethLbBps;
        uint16 wethCfBps;
        uint16 usdcCfBps;
        // Sentinel
        uint128 reputationSuccessReward;
        uint128 reputationFailurePenalty;
        uint16 agentShareBps;
        uint16 treasuryShareBps;
        uint16 bountyShareBps;
        uint256 scoreThreshold;
        uint256 perRequestDeposit;
        uint256 oracleStalenessThreshold;
        // Optional initial price overrides (0 means do not override)
        uint256 initialEthPriceUSD18;
        uint256 initialUsdcPriceUSD18;
        // Faucet
        bool enablePublicFaucet;
        uint256 wethFaucetCap;
        uint256 usdcFaucetCap;
        // Safety
        bool lockOracleOverrides;
        // Vault
        bool deployVault;
        address vaultOwner;
        string vaultMetadataURI;
    }

    struct Deployment {
        address weth;
        address usdc;
        address oracle;
        address pool;
        address sWeth;
        address sUsdc;
        address registry;
        address reputation;
        address splitter;
        address coordinator;
        address vault;
    }

    /* ------------------------------ Run path ----------------------------- */

    function run() external returns (Deployment memory d) {
        DeploymentConfig memory cfg = _loadConfigFromEnv();
        require(
            block.chainid == SHANNON_TESTNET || block.chainid == SOMNIA_MAINNET,
            "Deploy: unsupported chain (use Shannon testnet 50312 or mainnet 5031)"
        );

        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        d = deployAll(cfg);
        vm.stopBroadcast();

        _writeDeploymentJson(d);
        _logDeployment(d, cfg);
    }

    /* ----------------------- Pure deployment logic ----------------------- */

    function deployAll(DeploymentConfig memory cfg) public returns (Deployment memory d) {
        // 1. Bootstrap ERC20s. The pool is asset-agnostic; the deployment
        //    seeds it with our own WETH and USDC because canonical
        //    deployments are not exposed on Shannon.
        MintableERC20 weth = new MintableERC20("Sentinel WETH", "WETH", 18, cfg.deployer);
        MintableERC20 usdc = new MintableERC20("Sentinel USDC", "USDC", 6, cfg.deployer);
        d.weth = address(weth);
        d.usdc = address(usdc);

        // 2. Oracle. On testnet we also seed initial USD prices so the
        //    pool is immediately usable; on mainnet we leave registration
        //    to a follow-up tx that wires in the canonical DIA feeds.
        PriceOracleAdapter oracle = new PriceOracleAdapter(cfg.deployer, cfg.oracleStalenessThreshold);
        d.oracle = address(oracle);
        if (cfg.initialEthPriceUSD18 > 0) {
            oracle.setOverridePrice(address(weth), cfg.initialEthPriceUSD18);
        }
        if (cfg.initialUsdcPriceUSD18 > 0) {
            oracle.setOverridePrice(address(usdc), cfg.initialUsdcPriceUSD18);
        }

        // 3. Lending pool + reserves. SToken contracts are deployed
        //    automatically as a side effect of addReserve.
        LendingPool pool = new LendingPool(cfg.deployer, oracle);
        d.pool = address(pool);
        d.sWeth = pool.addReserve(
            address(weth),
            true,
            false,
            cfg.wethLtBps,
            cfg.wethLbBps,
            cfg.wethCfBps,
            "Sentinel sWETH",
            "sWETH"
        );
        d.sUsdc = pool.addReserve(
            address(usdc), false, true, 0, 0, cfg.usdcCfBps, "Sentinel sUSDC", "sUSDC"
        );

        // 4. Sentinel layer.
        AgentRegistry registry = new AgentRegistry();
        d.registry = address(registry);
        Reputation reputation = new Reputation(
            cfg.deployer, registry, cfg.reputationSuccessReward, cfg.reputationFailurePenalty
        );
        d.reputation = address(reputation);
        Splitter splitter = new Splitter(
            cfg.deployer,
            registry,
            reputation,
            cfg.treasury,
            cfg.agentShareBps,
            cfg.treasuryShareBps,
            cfg.bountyShareBps
        );
        d.splitter = address(splitter);
        Coordinator coordinator = new Coordinator(
            cfg.deployer,
            ISomniaAgents(cfg.somniaAgentsPlatform),
            pool,
            registry,
            reputation,
            splitter,
            cfg.scoreThreshold,
            cfg.perRequestDeposit
        );
        d.coordinator = address(coordinator);

        // 5. Authorize the Coordinator on the gated contracts.
        reputation.setCoordinator(address(coordinator));
        splitter.setCoordinator(address(coordinator));

        // 6. Testnet conveniences.
        if (cfg.enablePublicFaucet) {
            weth.configurePublicMint(true, cfg.wethFaucetCap);
            usdc.configurePublicMint(true, cfg.usdcFaucetCap);
        }

        // 7. Mainnet hardening. Permanently disables setOverridePrice.
        if (cfg.lockOracleOverrides) {
            oracle.lockOverrides();
        }

        // 8. Optional consumer demo.
        if (cfg.deployVault) {
            AutoProtectionVault vault = new AutoProtectionVault(
                cfg.vaultOwner,
                pool,
                coordinator,
                registry,
                IERC20(address(weth)),
                IERC20(address(usdc)),
                cfg.vaultMetadataURI
            );
            d.vault = address(vault);
        }
    }

    /* --------------------------- Env / JSON I/O -------------------------- */

    function _loadConfigFromEnv() internal view returns (DeploymentConfig memory cfg) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        cfg.deployer = vm.addr(pk);
        cfg.treasury = vm.envOr("TREASURY_ADDRESS", cfg.deployer);
        cfg.somniaAgentsPlatform = vm.envAddress("SOMNIA_AGENTS_PLATFORM");

        cfg.wethLtBps = uint16(vm.envOr("WETH_LT_BPS", uint256(7_500)));
        cfg.wethLbBps = uint16(vm.envOr("WETH_LB_BPS", uint256(500)));
        cfg.wethCfBps = uint16(vm.envOr("WETH_CF_BPS", uint256(5_000)));
        cfg.usdcCfBps = uint16(vm.envOr("USDC_CF_BPS", uint256(5_000)));

        cfg.reputationSuccessReward = uint128(vm.envOr("REPUTATION_SUCCESS_REWARD", uint256(100)));
        cfg.reputationFailurePenalty = uint128(vm.envOr("REPUTATION_FAILURE_PENALTY", uint256(50)));
        cfg.agentShareBps = uint16(vm.envOr("AGENT_SHARE_BPS", uint256(6_000)));
        cfg.treasuryShareBps = uint16(vm.envOr("TREASURY_SHARE_BPS", uint256(3_000)));
        cfg.bountyShareBps = uint16(vm.envOr("BOUNTY_SHARE_BPS", uint256(1_000)));
        cfg.scoreThreshold = vm.envOr("SCORE_THRESHOLD", uint256(5_000));
        cfg.perRequestDeposit = vm.envOr("PER_REQUEST_DEPOSIT", uint256(0.12 ether));
        cfg.oracleStalenessThreshold = vm.envOr("ORACLE_STALENESS_THRESHOLD", uint256(1 days));

        if (block.chainid == SHANNON_TESTNET) {
            cfg.initialEthPriceUSD18 = vm.envOr("INITIAL_ETH_PRICE_USD18", uint256(3_000e18));
            cfg.initialUsdcPriceUSD18 = vm.envOr("INITIAL_USDC_PRICE_USD18", uint256(1e18));
            cfg.enablePublicFaucet = true;
            cfg.wethFaucetCap = vm.envOr("WETH_FAUCET_CAP", uint256(100 ether));
            cfg.usdcFaucetCap = vm.envOr("USDC_FAUCET_CAP", uint256(100_000e6));
            cfg.lockOracleOverrides = false;
        } else {
            cfg.initialEthPriceUSD18 = 0;
            cfg.initialUsdcPriceUSD18 = 0;
            cfg.enablePublicFaucet = false;
            cfg.wethFaucetCap = 0;
            cfg.usdcFaucetCap = 0;
            cfg.lockOracleOverrides = true;
        }

        cfg.deployVault = vm.envOr("DEPLOY_DEMO_VAULT", true);
        cfg.vaultOwner = vm.envOr("VAULT_OWNER", cfg.deployer);
        cfg.vaultMetadataURI = vm.envOr("VAULT_METADATA_URI", string("ipfs://sentinel/vault/v1"));
    }

    function _writeDeploymentJson(Deployment memory d) internal {
        string memory chainName = block.chainid == SHANNON_TESTNET ? "shannon-testnet" : "mainnet";
        string memory path = string.concat("./deployments/", chainName, ".json");

        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeUint(json, "blockNumber", block.number);
        vm.serializeAddress(json, "weth", d.weth);
        vm.serializeAddress(json, "usdc", d.usdc);
        vm.serializeAddress(json, "oracle", d.oracle);
        vm.serializeAddress(json, "pool", d.pool);
        vm.serializeAddress(json, "sWeth", d.sWeth);
        vm.serializeAddress(json, "sUsdc", d.sUsdc);
        vm.serializeAddress(json, "registry", d.registry);
        vm.serializeAddress(json, "reputation", d.reputation);
        vm.serializeAddress(json, "splitter", d.splitter);
        vm.serializeAddress(json, "coordinator", d.coordinator);
        string memory finalJson = vm.serializeAddress(json, "vault", d.vault);

        vm.writeJson(finalJson, path);
    }

    function _logDeployment(Deployment memory d, DeploymentConfig memory cfg) internal pure {
        console2.log("=== Sentinel deployment ===");
        console2.log("deployer        ", cfg.deployer);
        console2.log("treasury        ", cfg.treasury);
        console2.log("somniaAgents    ", cfg.somniaAgentsPlatform);
        console2.log("---");
        console2.log("WETH            ", d.weth);
        console2.log("USDC            ", d.usdc);
        console2.log("PriceOracle     ", d.oracle);
        console2.log("LendingPool     ", d.pool);
        console2.log("sWETH           ", d.sWeth);
        console2.log("sUSDC           ", d.sUsdc);
        console2.log("AgentRegistry   ", d.registry);
        console2.log("Reputation      ", d.reputation);
        console2.log("Splitter        ", d.splitter);
        console2.log("Coordinator     ", d.coordinator);
        console2.log("AutoProtectVault", d.vault);

        // Env-paste-ready block. Pipe these lines into `.env.local`:
        //   forge script ... | grep -E "^(SENTINEL|SENTINEL_DEMO)_" >> .env.local
        console2.log("--- env ---");
        console2.log(string.concat("SENTINEL_WETH=", _toHex(d.weth)));
        console2.log(string.concat("SENTINEL_USDC=", _toHex(d.usdc)));
        console2.log(string.concat("SENTINEL_PRICE_ORACLE_ADAPTER=", _toHex(d.oracle)));
        console2.log(string.concat("SENTINEL_LENDING_POOL=", _toHex(d.pool)));
        console2.log(string.concat("SENTINEL_S_WETH=", _toHex(d.sWeth)));
        console2.log(string.concat("SENTINEL_S_USDC=", _toHex(d.sUsdc)));
        console2.log(string.concat("SENTINEL_AGENT_REGISTRY=", _toHex(d.registry)));
        console2.log(string.concat("SENTINEL_REPUTATION=", _toHex(d.reputation)));
        console2.log(string.concat("SENTINEL_SPLITTER=", _toHex(d.splitter)));
        console2.log(string.concat("SENTINEL_COORDINATOR=", _toHex(d.coordinator)));
        console2.log(string.concat("SENTINEL_AUTO_PROTECTION_VAULT=", _toHex(d.vault)));
    }

    function _toHex(address a) private pure returns (string memory) {
        return vm.toString(a);
    }
}
