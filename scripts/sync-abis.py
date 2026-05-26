#!/usr/bin/env python3
"""
Extract the seven contract ABIs the frontend cares about from Foundry's
build output and write them as standalone TypeScript modules under
packages/frontend/src/lib/abi/.

Run this whenever the contracts change:

    forge build --root contracts
    python3 scripts/sync-abis.py

The generated files are committed to source so the frontend has no
build-time dependency on contracts/out - Vercel can deploy without
needing Foundry on the build machine.
"""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORGE_OUT = ROOT / "contracts" / "out"
DEST = ROOT / "packages" / "frontend" / "src" / "lib" / "abi"

# (forge artifact path, generated module name, exported binding name)
TARGETS: list[tuple[str, str, str]] = [
    ("LendingPool.sol/LendingPool.json", "lendingPool.ts", "lendingPoolAbi"),
    ("Coordinator.sol/Coordinator.json", "coordinator.ts", "coordinatorAbi"),
    ("AgentRegistry.sol/AgentRegistry.json", "agentRegistry.ts", "agentRegistryAbi"),
    ("Reputation.sol/Reputation.json", "reputation.ts", "reputationAbi"),
    ("Splitter.sol/Splitter.json", "splitter.ts", "splitterAbi"),
    (
        "PriceOracleAdapter.sol/PriceOracleAdapter.json",
        "priceOracleAdapter.ts",
        "priceOracleAdapterAbi",
    ),
    ("MintableERC20.sol/MintableERC20.json", "mintableErc20.ts", "mintableErc20Abi"),
]

HEADER = (
    "// Auto-generated from contracts/out by scripts/sync-abis.py.\n"
    "// Edit the Solidity source then run the script - do not hand-edit.\n"
    "\n"
    "import type {{ Abi }} from \"viem\";\n"
    "\n"
    "export const {binding}: Abi = {payload} as const;\n"
)


def extract(artifact_path: Path) -> list[dict]:
    data = json.loads(artifact_path.read_text())
    abi = data.get("abi")
    if not isinstance(abi, list):
        raise SystemExit(f"no abi field in {artifact_path}")
    return abi


def main() -> None:
    if not FORGE_OUT.exists():
        raise SystemExit(
            f"forge output not found at {FORGE_OUT}. Run `forge build --root contracts` first."
        )

    DEST.mkdir(parents=True, exist_ok=True)

    for source, module, binding in TARGETS:
        artifact = FORGE_OUT / source
        abi = extract(artifact)
        payload = json.dumps(abi, indent=2)
        body = HEADER.format(binding=binding, payload=payload)
        (DEST / module).write_text(body)
        print(f"wrote {DEST / module} ({len(abi)} entries)")


if __name__ == "__main__":
    main()
