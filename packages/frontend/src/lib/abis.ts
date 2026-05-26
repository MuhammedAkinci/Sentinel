// Re-export the contract ABIs as a flat surface for the frontend.
// The underlying typed modules under ./abi are generated from Foundry's
// build output via `python3 scripts/sync-abis.py`. Keep this file thin
// so call sites only ever import `~/lib/abis` and never see the
// generated/regenerated layout under ./abi/.

export { lendingPoolAbi } from "./abi/lendingPool";
export { coordinatorAbi } from "./abi/coordinator";
export { agentRegistryAbi } from "./abi/agentRegistry";
export { reputationAbi } from "./abi/reputation";
export { splitterAbi } from "./abi/splitter";
export { priceOracleAdapterAbi } from "./abi/priceOracleAdapter";
export { mintableErc20Abi } from "./abi/mintableErc20";
