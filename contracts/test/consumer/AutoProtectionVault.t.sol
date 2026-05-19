// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AgentRegistry } from "../../src/sentinel/AgentRegistry.sol";
import { Reputation } from "../../src/sentinel/Reputation.sol";
import { Splitter } from "../../src/sentinel/Splitter.sol";
import { Coordinator } from "../../src/sentinel/Coordinator.sol";
import { AutoProtectionVault } from "../../src/consumer/AutoProtectionVault.sol";

import { LendingPool } from "../../src/lending/LendingPool.sol";
import { MintableERC20 } from "../../src/lending/MintableERC20.sol";
import { PriceOracleAdapter } from "../../src/lending/PriceOracleAdapter.sol";
import { ISomniaAgents } from "../../src/interfaces/somnia/ISomniaAgents.sol";

contract AutoProtectionVaultTest is Test {
    address internal constant SOMNIA_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;

    uint256 internal constant SCORER_SOMNIA_ID = 2001;
    uint256 internal constant ROUTER_SOMNIA_ID = 2002;
    uint256 internal constant SCORER_REQ_ID = 6001;
    uint256 internal constant ROUTER_REQ_ID = 6002;
    uint256 internal constant PER_REQUEST_DEPOSIT = 0.12 ether;

    address internal owner = makeAddr("owner");
    address internal user = makeAddr("vaultUser");
    address internal liquiditySupplier = makeAddr("liquiditySupplier");
    address internal treasury = makeAddr("treasury");

    address internal opS = makeAddr("opScorer");
    address internal opR = makeAddr("opRouter");
    address internal opE = makeAddr("opExecutor");

    MintableERC20 internal weth;
    MintableERC20 internal usdc;
    PriceOracleAdapter internal oracle;
    LendingPool internal pool;

    AgentRegistry internal registry;
    Reputation internal reputation;
    Splitter internal splitter;
    Coordinator internal coordinator;
    AutoProtectionVault internal vault;

    uint256 internal idS;
    uint256 internal idR;
    uint256 internal idE;

    function setUp() public {
        weth = new MintableERC20("Sentinel WETH", "WETH", 18, owner);
        usdc = new MintableERC20("Sentinel USDC", "USDC", 6, owner);

        oracle = new PriceOracleAdapter(owner, 1 days);
        vm.startPrank(owner);
        oracle.setOverridePrice(address(weth), 3_000e18);
        oracle.setOverridePrice(address(usdc), 1e18);
        vm.stopPrank();

        pool = new LendingPool(owner, oracle);
        vm.startPrank(owner);
        pool.addReserve(address(weth), true, false, 7_500, 500, 5_000, "sWETH", "sWETH");
        pool.addReserve(address(usdc), false, true, 0, 0, 5_000, "sUSDC", "sUSDC");
        vm.stopPrank();

        registry = new AgentRegistry();
        reputation = new Reputation(owner, registry, 100, 50);
        splitter = new Splitter(owner, registry, reputation, treasury, 6_000, 3_000, 1_000);
        coordinator = new Coordinator(
            owner,
            ISomniaAgents(SOMNIA_PLATFORM),
            pool,
            registry,
            reputation,
            splitter,
            5_000,
            PER_REQUEST_DEPOSIT
        );

        vm.startPrank(owner);
        reputation.setCoordinator(address(coordinator));
        splitter.setCoordinator(address(coordinator));
        coordinator.setScorerSomniaAgentId(SCORER_SOMNIA_ID);
        coordinator.setRouterSomniaAgentId(ROUTER_SOMNIA_ID);
        vm.stopPrank();

        // The Scorer / Router / Executor agents register normally. The Vault
        // self-registers as Watcher in its constructor.
        vm.prank(opS);
        idS = registry.register(AgentRegistry.Role.Scorer, "ipfs://s");
        vm.prank(opR);
        idR = registry.register(AgentRegistry.Role.Router, "ipfs://r");
        vm.prank(opE);
        idE = registry.register(AgentRegistry.Role.Executor, "ipfs://e");

        vm.startPrank(owner);
        coordinator.setScorerSentinelAgentId(idS);
        coordinator.setRouterSentinelAgentId(idR);
        vm.stopPrank();

        // Mint the user some WETH and supply USDC liquidity.
        vm.startPrank(owner);
        weth.mintTo(user, 50 ether);
        usdc.mintTo(liquiditySupplier, 1_000_000e6);
        usdc.mintTo(address(coordinator), 100_000e6);
        vm.stopPrank();
        vm.deal(address(coordinator), 10 ether);

        vm.startPrank(liquiditySupplier);
        usdc.approve(address(pool), 500_000e6);
        pool.deposit(address(usdc), 500_000e6);
        vm.stopPrank();

        // Deploy the vault. It registers its own Watcher agent in the
        // constructor — that's what `requestSentinelProtection` uses.
        vault = new AutoProtectionVault(
            user, pool, coordinator, registry, IERC20(address(weth)), IERC20(address(usdc)), "ipfs://vault"
        );
    }

    /* -------------------------- Vault registers itself -------------------- */

    function test_vaultRegistersWatcherAtConstruction() public view {
        uint256 watcherId = vault.watcherAgentId();
        AgentRegistry.Agent memory a = registry.getAgent(watcherId);
        assertEq(a.operator, address(vault));
        assertEq(uint8(a.role), uint8(AgentRegistry.Role.Watcher));
        assertEq(a.metadataURI, "ipfs://vault");
        assertTrue(a.active);
    }

    /* ------------------------- Position lifecycle ------------------------ */

    function test_depositRoutesIntoPool() public {
        vm.startPrank(user);
        weth.approve(address(vault), 10 ether);
        vault.deposit(10 ether);
        vm.stopPrank();

        assertEq(weth.balanceOf(address(pool)), 10 ether);
        assertEq(pool.healthFactor(address(vault)), type(uint256).max);
    }

    function test_borrowForwardsToUser() public {
        vm.startPrank(user);
        weth.approve(address(vault), 10 ether);
        vault.deposit(10 ether);
        vault.borrow(15_000e6);
        vm.stopPrank();

        assertEq(usdc.balanceOf(user), 15_000e6);
        assertEq(pool.debtOf(address(vault), address(usdc)), 15_000e6);
    }

    function test_repayReducesVaultDebt() public {
        _openHealthyPosition();
        vm.startPrank(user);
        usdc.approve(address(vault), 5_000e6);
        vault.repay(5_000e6);
        vm.stopPrank();

        assertEq(pool.debtOf(address(vault), address(usdc)), 10_000e6);
    }

    function test_withdrawReturnsCollateralToUser() public {
        vm.startPrank(user);
        weth.approve(address(vault), 10 ether);
        vault.deposit(10 ether);
        vault.withdraw(4 ether);
        vm.stopPrank();

        assertEq(weth.balanceOf(user), 50 ether - 10 ether + 4 ether);
    }

    function test_revert_depositNotOwner() public {
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(AutoProtectionVault.OnlyOwner.selector, stranger));
        vm.prank(stranger);
        vault.deposit(1 ether);
    }

    /* ------------------------- Sentinel protection ----------------------- */

    function test_revert_protectionRequestOnHealthyPosition() public {
        _openHealthyPosition();
        vm.expectRevert(
            abi.encodeWithSelector(
                Coordinator.PositionHealthy.selector, pool.healthFactor(address(vault))
            )
        );
        vault.requestSentinelProtection();
    }

    function test_protectionRequestOnUnhealthyPositionStartsCase() public {
        _openHealthyPosition();
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);

        vm.recordLogs();
        uint256 caseId = vault.requestSentinelProtection();
        assertEq(caseId, 1);

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Flagged));
        assertEq(c.user, address(vault));
        assertEq(c.watcherAgentId, vault.watcherAgentId());
    }

    function test_endToEndVaultProtectionFlow() public {
        _openHealthyPosition();
        _crashEth();
        _mockCreateRequest(SCORER_SOMNIA_ID, SCORER_REQ_ID);
        _mockCreateRequest(ROUTER_SOMNIA_ID, ROUTER_REQ_ID);

        // Anyone can trigger the protection — here the user's keeper.
        uint256 caseId = vault.requestSentinelProtection();

        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleScorerResponse(
            SCORER_REQ_ID,
            _successResponse(abi.encode(uint256(9_000))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        vm.prank(SOMNIA_PLATFORM);
        coordinator.handleRouterResponse(
            ROUTER_REQ_ID,
            _successResponse(abi.encode(uint256(7_500e6))),
            ISomniaAgents.ResponseStatus.Success,
            _emptyRequest()
        );

        vm.prank(opE);
        coordinator.execute(caseId, idE);

        Coordinator.Case memory c = coordinator.getCase(caseId);
        assertEq(uint8(c.status), uint8(Coordinator.CaseStatus.Executed));
        assertEq(c.collateralSeized, 4.375e18);

        // The vault's reputation (as the Watcher that flagged its own case)
        // got credited on success.
        uint256 vaultAgentId = vault.watcherAgentId();
        assertEq(reputation.scoreOf(vaultAgentId), 100);

        // Vault is the operator of its own Watcher — the vault itself ends
        // up with a claimable WETH share in the Splitter.
        uint256 owedToVault =
            splitter.owed(IERC20(address(weth)), address(vault));
        assertGt(owedToVault, 0);
    }

    /* -------------------------- Internal helpers ------------------------- */

    function _openHealthyPosition() internal {
        vm.startPrank(user);
        weth.approve(address(vault), 10 ether);
        vault.deposit(10 ether);
        vault.borrow(15_000e6);
        vm.stopPrank();
    }

    function _crashEth() internal {
        vm.prank(owner);
        oracle.setOverridePrice(address(weth), 1_800e18);
    }

    function _mockCreateRequest(uint256 agentId, uint256 reqId) internal {
        vm.mockCall(
            SOMNIA_PLATFORM,
            abi.encodeWithSelector(ISomniaAgents.createRequest.selector, agentId),
            abi.encode(reqId)
        );
    }

    function _emptyRequest() internal pure returns (ISomniaAgents.Request memory) {
        return ISomniaAgents.Request({
            id: 0,
            requester: address(0),
            callbackAddress: address(0),
            callbackSelector: bytes4(0),
            subcommittee: new address[](0),
            responses: new ISomniaAgents.Response[](0),
            responseCount: 0,
            failureCount: 0,
            threshold: 0,
            createdAt: 0,
            deadline: 0,
            status: ISomniaAgents.ResponseStatus.Success,
            consensusType: ISomniaAgents.ConsensusType.Majority,
            remainingBudget: 0,
            perAgentBudget: 0
        });
    }

    function _successResponse(bytes memory result) internal pure returns (ISomniaAgents.Response[] memory r) {
        r = new ISomniaAgents.Response[](1);
        r[0] = ISomniaAgents.Response({
            validator: address(0xBeeF),
            result: result,
            status: ISomniaAgents.ResponseStatus.Success,
            receipt: 1,
            timestamp: 0,
            executionCost: 0
        });
    }
}
