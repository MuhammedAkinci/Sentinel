import type { Abi } from "viem";

// Forge build artefacts. `forge build` (from contracts/) regenerates these.
// The frontend doesn't sign type-narrowed contract reads off these abis;
// keeping them loose-typed via `as Abi` is intentional.
import lendingPoolArtifact from "../../../../contracts/out/LendingPool.sol/LendingPool.json" with {
  type: "json",
};
import coordinatorArtifact from "../../../../contracts/out/Coordinator.sol/Coordinator.json" with {
  type: "json",
};
import agentRegistryArtifact from "../../../../contracts/out/AgentRegistry.sol/AgentRegistry.json" with {
  type: "json",
};
import reputationArtifact from "../../../../contracts/out/Reputation.sol/Reputation.json" with {
  type: "json",
};
import splitterArtifact from "../../../../contracts/out/Splitter.sol/Splitter.json" with {
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
export const reputationAbi = reputationArtifact.abi as Abi;
export const splitterAbi = splitterArtifact.abi as Abi;
export const priceOracleAdapterAbi = priceOracleAdapterArtifact.abi as Abi;
export const mintableErc20Abi = mintableErc20Artifact.abi as Abi;
