#!/usr/bin/env bash
# Sentinel Shannon testnet smoke test.
#
# Prerequisites:
#   - Contracts deployed via `forge script script/Deploy.s.sol --broadcast`
#   - The deploy script's env block (SENTINEL_*) appended to .env
#   - DEPLOYER_PRIVATE_KEY funded with at least ~0.5 STT for the setup txs
#
# What this does:
#   1. Verifies every deployed contract has code on Shannon.
#   2. Mints WETH and USDC via the public faucet on the MintableERC20s.
#   3. Supplies USDC liquidity into the LendingPool so there is something to borrow.
#   4. Opens a healthy WETH-collateralised USDC borrow position.
#   5. Prints the on-chain health factor (expected ~1.5).
#   6. Crashes the WETH oracle override from $3,000 to $1,800.
#   7. Re-prints the health factor (expected ~0.9, position now liquidatable).
#
# After this script: start the Watcher binary against the same .env and observe
# it call Coordinator.flagPosition automatically, then start the Executor for
# the second leg of the demo.

set -euo pipefail

# ---- Bootstrap env -----------------------------------------------------------
if [ ! -f .env ]; then
  echo "FATAL: .env not found in $(pwd). Run from project root." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

req_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "FATAL: $name not set in .env (run deploy first and copy the SENTINEL_* block)" >&2
    exit 1
  fi
}
for v in \
  SOMNIA_RPC_HTTP DEPLOYER_PRIVATE_KEY \
  SENTINEL_WETH SENTINEL_USDC SENTINEL_LENDING_POOL SENTINEL_PRICE_ORACLE_ADAPTER \
  SENTINEL_COORDINATOR SENTINEL_AGENT_REGISTRY; do
  req_env "$v"
done

RPC="$SOMNIA_RPC_HTTP"
DEPLOYER=$(cast wallet address "$DEPLOYER_PRIVATE_KEY")

# ---- Amounts (token-native decimals) ----------------------------------------
# Must respect the MintableERC20 publicMintCap set at deploy time. If you see
# a revert at faucet mint, bump the cap with
# configurePublicMint(true, newCap) before re-running, or split mints across
# multiple calls.
WETH_FAUCET_AMT="50000000000000000000"        # 50 WETH (18 decimals)
USDC_FAUCET_AMT="100000000000"                # 100,000 USDC (6 decimals) — within the 100k default cap
USDC_LIQUIDITY="80000000000"                  # 80,000 USDC supplied as borrowable liquidity
WETH_COLLATERAL="10000000000000000000"        # 10 WETH deposited
USDC_BORROW="15000000000"                     # 15,000 USDC borrowed
CRASHED_ETH_PRICE_USD18="1800000000000000000000"  # $1,800 in 1e18 scale

# ---- Helpers -----------------------------------------------------------------
GAS_LIMIT=16000000
send() {
  # Usage: send <to> <sig> [args...]
  local to="$1"; shift
  local sig="$1"; shift
  cast send \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --rpc-url "$RPC" \
    --gas-limit "$GAS_LIMIT" \
    "$to" "$sig" "$@" | grep -E "(transactionHash|status|gasUsed)" || true
}

call() {
  # Usage: call <to> <sig> [args...]
  cast call --rpc-url "$RPC" "$@"
}

hr() { printf '\n========== %s ==========\n' "$1"; }

# ---- Phase 0: Verify deployment ---------------------------------------------
hr "Phase 0: verify deployed contracts have code"
for name in WETH USDC LENDING_POOL PRICE_ORACLE_ADAPTER COORDINATOR AGENT_REGISTRY; do
  varname="SENTINEL_$name"
  addr="${!varname}"
  code=$(cast code "$addr" --rpc-url "$RPC")
  if [ "${code}" = "0x" ] || [ "${code}" = "0x0" ]; then
    echo "FATAL: $name at $addr has no code" >&2
    exit 1
  fi
  printf '  %-25s %s OK (%d bytes)\n' "$name" "$addr" "$((${#code}/2 - 1))"
done

hr "Phase 1: faucet mint to deployer"
echo "  Minting $WETH_FAUCET_AMT WETH..."
send "$SENTINEL_WETH" "mint(address,uint256)" "$DEPLOYER" "$WETH_FAUCET_AMT"
echo "  Minting $USDC_FAUCET_AMT USDC..."
send "$SENTINEL_USDC" "mint(address,uint256)" "$DEPLOYER" "$USDC_FAUCET_AMT"
echo "  WETH balance: $(call "$SENTINEL_WETH" 'balanceOf(address)(uint256)' "$DEPLOYER")"
echo "  USDC balance: $(call "$SENTINEL_USDC" 'balanceOf(address)(uint256)' "$DEPLOYER")"

hr "Phase 2: approve LendingPool for both assets"
send "$SENTINEL_WETH" "approve(address,uint256)" "$SENTINEL_LENDING_POOL" "$WETH_FAUCET_AMT"
send "$SENTINEL_USDC" "approve(address,uint256)" "$SENTINEL_LENDING_POOL" "$USDC_FAUCET_AMT"

hr "Phase 3: supply USDC liquidity"
echo "  Depositing $USDC_LIQUIDITY USDC..."
send "$SENTINEL_LENDING_POOL" "deposit(address,uint256)" "$SENTINEL_USDC" "$USDC_LIQUIDITY"

hr "Phase 4: deposit WETH collateral"
echo "  Depositing $WETH_COLLATERAL WETH..."
send "$SENTINEL_LENDING_POOL" "deposit(address,uint256)" "$SENTINEL_WETH" "$WETH_COLLATERAL"

hr "Phase 5: borrow USDC"
echo "  Borrowing $USDC_BORROW USDC..."
send "$SENTINEL_LENDING_POOL" "borrow(address,uint256)" "$SENTINEL_USDC" "$USDC_BORROW"

hr "Phase 6: health factor BEFORE crash"
# cast returns "<dec> [<scientific>]" for big numbers; strip the bracket part.
hf_before=$(call "$SENTINEL_LENDING_POOL" "healthFactor(address)(uint256)" "$DEPLOYER" | sed 's/ \[.*\]//')
echo "  raw 1e18: $hf_before"
echo "  decimal:  $(cast --to-unit "$hf_before" 18)"

hr "Phase 7: crash WETH oracle to \$1,800"
send "$SENTINEL_PRICE_ORACLE_ADAPTER" "setOverridePrice(address,uint256)" "$SENTINEL_WETH" "$CRASHED_ETH_PRICE_USD18"

hr "Phase 8: health factor AFTER crash"
hf_after=$(call "$SENTINEL_LENDING_POOL" "healthFactor(address)(uint256)" "$DEPLOYER" | sed 's/ \[.*\]//')
echo "  raw 1e18: $hf_after"
echo "  decimal:  $(cast --to-unit "$hf_after" 18)"

if [ "$hf_after" -lt "1000000000000000000" ]; then
  echo
  echo "SUCCESS: position is now LIQUIDATABLE (HF < 1.0)."
  echo "Next: start the Watcher binary so it can call Coordinator.flagPosition,"
  echo "      then start the Executor to settle the resulting case."
else
  echo
  echo "WARNING: HF is still >= 1.0 after the crash. Check the override math."
  exit 1
fi
