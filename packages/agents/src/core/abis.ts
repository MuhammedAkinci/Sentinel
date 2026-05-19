import type { Abi } from "viem";

// Foundry build artifacts. Forge writes these on every `forge build`.
// They must exist before the agent runtime is started; the package's
// `prebuild` flow runs `forge build` from the contracts/ workspace.
import lendingPoolArtifact from "../../../../contracts/out/LendingPool.sol/LendingPool.json" with {
  type: "json",
};
import coordinatorArtifact from "../../../../contracts/out/Coordinator.sol/Coordinator.json" with {
  type: "json",
};
import agentRegistryArtifact from "../../../../contracts/out/AgentRegistry.sol/AgentRegistry.json" with {
  type: "json",
};
import priceOracleAdapterArtifact from "../../../../contracts/out/PriceOracleAdapter.sol/PriceOracleAdapter.json" with {
  type: "json",
};
import mintableErc20Artifact from "../../../../contracts/out/MintableERC20.sol/MintableERC20.json" with {
  type: "json",
};

export const lendingPoolAbi = lendingPoolArtifact.abi as Abi;
export const coordinatorAbi = coordinatorArtifact.abi as Abi;
export const agentRegistryAbi = agentRegistryArtifact.abi as Abi;
export const priceOracleAdapterAbi = priceOracleAdapterArtifact.abi as Abi;
export const mintableErc20Abi = mintableErc20Artifact.abi as Abi;
