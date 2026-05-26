"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits } from "viem";

import { addresses, env } from "~/lib/env";
import { lendingPoolAbi, mintableErc20Abi, priceOracleAdapterAbi, coordinatorAbi } from "~/lib/abis";
import { explorer } from "~/lib/utils";
import { Panel } from "./ActivePositions";

type ButtonState = "idle" | "pending" | "success" | "error";

interface ActionResult {
  hash?: `0x${string}`;
  error?: string;
}

export function CaseConsole() {
  const { address } = useAccount();
  const expectedDeployer = env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
  const isConnected = !!address;
  const isDeployer =
    isConnected &&
    !!expectedDeployer &&
    address.toLowerCase() === expectedDeployer.toLowerCase();

  return <CaseConsoleBody isConnected={isConnected} isDeployer={isDeployer} expectedDeployer={expectedDeployer} />;
}

function CaseConsoleBody({
  isConnected,
  isDeployer,
  expectedDeployer,
}: {
  isConnected: boolean;
  isDeployer: boolean;
  expectedDeployer: `0x${string}` | undefined;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Panel
      title="Case Console"
      subtitle="Drive a full Sentinel case end-to-end. Oracle setters and flagPosition require the deployer wallet; faucet mint plus deposit, borrow, repay and withdraw work for any account."
      action={
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Hide" : "Show"}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      }
    >
      {expanded ? (
        <div>
          <div className="border-b border-border bg-muted/40 px-5 py-4 text-xs leading-relaxed text-foreground/80">
            {!isConnected ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-danger">
                Connect a wallet to submit case transactions.
              </p>
            ) : !isDeployer ? (
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-danger">
                Connected as a non-deployer. Crash Oracle, Reset Oracle and Trigger flagPosition will revert. Connect{" "}
                <span className="text-foreground">{expectedDeployer?.slice(0, 6)}...{expectedDeployer?.slice(-4)}</span>{" "}
                to unlock the full pipeline.
              </p>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">
                Deployer connected. All controls unlocked.
              </p>
            )}
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              How to drive a full case
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                <span className="text-foreground">Open Position</span>: reset the WETH oracle to $3,000, mint 10 WETH from the faucet, approve, deposit, then borrow 15,000 USDC. Five sequential signatures.
              </li>
              <li>
                <span className="text-foreground">Crash Oracle</span>: drop the WETH price to the value that pushes this account's HF to 0.85. Auto-computed from live position state. The position becomes liquidatable.
              </li>
              <li>
                <span className="text-foreground">Trigger flagPosition</span>: submit the inferNumber prompt referenced in Somnia's llm-inference documentation. The Coordinator dispatches a Somnia native createRequest; the Scored callback lands within seconds.
              </li>
              <li>
                <span className="text-foreground">Advance to Router</span>: push the latest Scored case forward. The Coordinator dispatches a second createRequest; the Routed callback lands within seconds.
              </li>
              <li>
                <span className="text-foreground">Execute</span>: settle the latest Routed case. LendingPool liquidation runs, the seized collateral lands in the Splitter, and Reputation credits all four participating agents.
              </li>
              <li>
                <span className="text-foreground">Close Position</span> when you want to clear your outstanding debt and withdraw every unit of collateral - mints any USDC delta, approves, repays, then withdraws.
              </li>
              <li>
                <span className="text-foreground">Reset Oracle</span> to put the WETH oracle back at $3,000 between runs.
              </li>
            </ol>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-2">
            <OpenPositionAction />
            <CrashOracleAction />
            <FlagPositionAction />
            <AdvanceToRouterAction />
            <ExecuteAction />
            <ClosePositionAction />
            <ResetOracleAction />
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  state,
  result,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  state: ButtonState;
  result: ActionResult | null;
  onClick: () => void;
}) {
  return (
    <div className="bg-background/60 p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={state === "pending"}
        className="mt-4 inline-flex items-center gap-2 border border-primary/60 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "pending" ? "Submitting…" : buttonLabel}
      </button>
      {result?.hash ? (
        <a
          href={explorer.tx(result.hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
        >
          {result.hash.slice(0, 10)}…{result.hash.slice(-8)}
          <ArrowUpRight size={10} />
        </a>
      ) : null}
      {result?.error ? (
        <p className="mt-3 font-mono text-[11px] text-danger">{result.error}</p>
      ) : null}
    </div>
  );
}

function useAction(): {
  state: ButtonState;
  result: ActionResult | null;
  run: (fn: () => Promise<`0x${string}`>) => Promise<void>;
} {
  const [state, setState] = useState<ButtonState>("idle");
  const [result, setResult] = useState<ActionResult | null>(null);
  const publicClient = usePublicClient();

  const run = async (fn: () => Promise<`0x${string}`>) => {
    setState("pending");
    setResult(null);
    try {
      const hash = await fn();
      setResult({ hash });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ error: message.slice(0, 120) });
      setState("error");
    }
  };

  return { state, result, run };
}

function OpenPositionAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");
      if (!publicClient) throw new Error("Public client not ready.");
      const tenWeth = parseUnits("10", 18);
      const fifteenK = parseUnits("15000", 6);
      const healthyEthPrice = parseUnits("3000", 18);

      // Every step here reads state set by the previous one: deposit
      // requires the mint + approve to have landed, borrow requires
      // the deposit to be reflected in the pool's collateral
      // accounting. Submitting them back to back without waiting
      // confuses the sequencer's nonce ordering and the chain's
      // post-condition checks. Await every receipt.
      const submitAndWait = async (
        request: Parameters<typeof walletClient.writeContract>[0],
      ): Promise<`0x${string}`> => {
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      };

      // The borrow only fits if ETH is at its healthy price. Reset the
      // oracle first so any prior price override does not block the new
      // position.
      await submitAndWait({
        address: addresses.oracle,
        abi: priceOracleAdapterAbi,
        functionName: "setOverridePrice",
        args: [addresses.weth, healthyEthPrice],
        account: address,
        chain: walletClient.chain ?? null,
      });
      await submitAndWait({
        address: addresses.weth,
        abi: mintableErc20Abi,
        functionName: "mint",
        args: [address, tenWeth],
        account: address,
        chain: walletClient.chain ?? null,
      });
      await submitAndWait({
        address: addresses.weth,
        abi: mintableErc20Abi,
        functionName: "approve",
        args: [addresses.pool, tenWeth],
        account: address,
        chain: walletClient.chain ?? null,
      });
      await submitAndWait({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "deposit",
        args: [addresses.weth, tenWeth],
        account: address,
        chain: walletClient.chain ?? null,
      });
      const borrowHash = await submitAndWait({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "borrow",
        args: [addresses.usdc, fifteenK],
        account: address,
        chain: walletClient.chain ?? null,
      });
      return borrowHash;
    });

  return (
    <ActionCard
      title="Open Test Position"
      description="Reset oracle to $3,000, mint 10 WETH, approve, deposit, borrow 15,000 USDC. Five sequential transactions."
      buttonLabel="Open Position"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function CrashOracleAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");
      if (!publicClient) throw new Error("Public client not ready.");

      // Read the connected user's live health factor and the current WETH
      // oracle price. HF is linear in collateral price for a single-asset
      // collateral pool, so the target price that lands HF at TARGET_HF is
      // simply currentPrice * (TARGET_HF / currentHF). No decimals math.
      const [currentHf, currentPrice] = await Promise.all([
        publicClient.readContract({
          address: addresses.pool,
          abi: lendingPoolAbi,
          functionName: "healthFactor",
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: addresses.oracle,
          abi: priceOracleAdapterAbi,
          functionName: "getAssetPrice",
          args: [addresses.weth],
        }) as Promise<bigint>,
      ]);

      const NO_DEBT_SENTINEL = 10n ** 30n;
      if (currentHf >= NO_DEBT_SENTINEL) {
        throw new Error("Open a position first - no debt to crash against.");
      }

      // Aim for a clearly liquidatable HF that still leaves the position
      // with enough collateral cushion for a meaningful settlement.
      // 0.85 puts the Scorer in its high-confidence zone and lets the
      // Router pick the full close-factor cap.
      const TARGET_HF_18 = 850_000_000_000_000_000n;
      const raw = (currentPrice * TARGET_HF_18) / currentHf;

      // Snap to the nearest $50 below the raw target. Clean number for
      // the displayed price while staying safely under the liquidation
      // threshold. Floor at $50 so a heavily-underwater position cannot
      // round to zero.
      const STEP = 50n * 10n ** 18n;
      const snapped = (raw / STEP) * STEP;
      const targetPrice = snapped < STEP ? STEP : snapped;

      return walletClient.writeContract({
        address: addresses.oracle,
        abi: priceOracleAdapterAbi,
        functionName: "setOverridePrice",
        args: [addresses.weth, targetPrice],
      });
    });

  return (
    <ActionCard
      title="Crash Oracle"
      description="Drops the WETH oracle to a price that pushes this account's HF to 0.85. Computed from live position state - works for any borrower regardless of accumulated collateral."
      buttonLabel="Crash to HF 0.85"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function ResetOracleAction() {
  const { data: walletClient } = useWalletClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient) throw new Error("Wallet not ready.");
      const price = parseUnits("3000", 18);
      return walletClient.writeContract({
        address: addresses.oracle,
        abi: priceOracleAdapterAbi,
        functionName: "setOverridePrice",
        args: [addresses.weth, price],
      });
    });

  return (
    <ActionCard
      title="Reset Oracle"
      description="Restore the WETH oracle to $3,000 between runs."
      buttonLabel="Reset to $3,000"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function ClosePositionAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");
      if (!publicClient) throw new Error("Public client not ready.");

      // Read outstanding debt + collateral + USDC wallet balance so the
      // close sequence can decide whether to top up via the faucet.
      const debt = (await publicClient.readContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "debtOf",
        args: [address, addresses.usdc],
      })) as bigint;

      const reserveConfig = (await publicClient.readContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "reserveConfig",
        args: [addresses.weth],
      })) as { sToken: `0x${string}` };

      const [collateral, walletUsdc] = await Promise.all([
        publicClient.readContract({
          address: reserveConfig.sToken,
          abi: mintableErc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: addresses.usdc,
          abi: mintableErc20Abi,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
      ]);

      if (debt === 0n && collateral === 0n) {
        throw new Error("Nothing to close - no debt and no collateral.");
      }

      // Each step in the close sequence reads on-chain state set by the
      // previous step (the repay must land before the withdraw passes
      // LendingPool's solvency post-check). Submitting them back to
      // back without waiting risks the withdraw racing ahead of the
      // repay, so we await every receipt.
      const submitAndWait = async (
        request: Parameters<typeof walletClient.writeContract>[0],
      ): Promise<`0x${string}`> => {
        const hash = await walletClient.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      };

      let lastHash: `0x${string}` | null = null;

      if (debt > 0n) {
        // Top up USDC from the faucet if the wallet does not hold
        // enough to clear the debt. The faucet ERC20 has a configured
        // mint cap that comfortably exceeds any single test position.
        if (walletUsdc < debt) {
          const shortfall = debt - walletUsdc;
          lastHash = await submitAndWait({
            address: addresses.usdc,
            abi: mintableErc20Abi,
            functionName: "mint",
            args: [address, shortfall],
            account: address,
            chain: walletClient.chain ?? null,
          });
        }
        lastHash = await submitAndWait({
          address: addresses.usdc,
          abi: mintableErc20Abi,
          functionName: "approve",
          args: [addresses.pool, debt],
          account: address,
          chain: walletClient.chain ?? null,
        });
        lastHash = await submitAndWait({
          address: addresses.pool,
          abi: lendingPoolAbi,
          functionName: "repay",
          // The pool's repay takes (asset, amount, onBehalfOf). The
          // caller is closing their own position, so onBehalfOf is the
          // connected wallet.
          args: [addresses.usdc, debt, address],
          account: address,
          chain: walletClient.chain ?? null,
        });
      }

      if (collateral > 0n) {
        lastHash = await submitAndWait({
          address: addresses.pool,
          abi: lendingPoolAbi,
          functionName: "withdraw",
          args: [addresses.weth, collateral],
          account: address,
          chain: walletClient.chain ?? null,
        });
      }

      if (!lastHash) {
        throw new Error("Nothing to close.");
      }
      return lastHash;
    });

  return (
    <ActionCard
      title="Close Position"
      description="Repay all USDC debt and withdraw every unit of WETH collateral. Auto-mints any USDC delta from the faucet so the close always succeeds. Up to four signatures."
      buttonLabel="Close Position"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

const STATUS_FLAGGED = 1;
const STATUS_SCORED = 2;
const STATUS_ROUTED = 3;

interface OnchainCaseSnapshot {
  id: bigint;
  status: number;
}

/**
 * Walks the Coordinator case ledger from `nextCaseId - 1` downward and
 * returns the first case whose status matches `targetStatus`. Shannon's
 * RPC caps eth_getLogs at 1000 blocks, so we read storage directly via
 * `getCase(id)` rather than scanning event history.
 */
async function findLatestCaseByStatus(
  publicClient: import("viem").PublicClient,
  targetStatus: number,
): Promise<bigint | null> {
  const next = (await publicClient.readContract({
    address: addresses.coordinator,
    abi: coordinatorAbi,
    functionName: "nextCaseId",
  })) as bigint;
  if (next <= 1n) return null;

  for (let id = next - 1n; id >= 1n; id -= 1n) {
    try {
      const c = (await publicClient.readContract({
        address: addresses.coordinator,
        abi: coordinatorAbi,
        functionName: "getCase",
        args: [id],
      })) as OnchainCaseSnapshot;
      if (c.status === targetStatus) return id;
    } catch {
      // Missing case id - keep scanning.
    }
  }
  return null;
}

function FlagPositionAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");

      // Build the verbatim inferNumber payload from Somnia's llm-inference
      // documentation. The clamped-numeric output mode returns 10000
      // reliably for this prompt - high enough to clear the Coordinator's
      // scoreThreshold without any prompt drift.
      const sentimentPrompt = "Wonderful day, beautiful weather, everyone happy.";
      const sentimentSystem = "Rate sentiment from 0 (very negative) to 10000 (very positive).";
      const inferNumberSig = "inferNumber(string,string,int256,int256,bool)";
      const { encodeAbiParameters, keccak256, toHex, concat } = await import("viem");
      const selector = keccak256(toHex(inferNumberSig)).slice(0, 10) as `0x${string}`;
      const encoded = encodeAbiParameters(
        [
          { type: "string" },
          { type: "string" },
          { type: "int256" },
          { type: "int256" },
          { type: "bool" },
        ],
        [sentimentPrompt, sentimentSystem, 0n, 10_000n, false],
      );
      const scorerPayload = concat([selector, encoded]);

      // Watcher agent id 2 is owned by the deployer in the live deployment.
      const watcherAgentId = 2n;

      return walletClient.writeContract({
        address: addresses.coordinator,
        abi: coordinatorAbi,
        functionName: "flagPosition",
        args: [watcherAgentId, address, addresses.weth, addresses.usdc, scorerPayload],
      });
    });

  return (
    <ActionCard
      title="Trigger flagPosition"
      description="Submit the verbatim inferNumber prompt from Somnia's llm-inference docs with watcherAgentId=2. Expect a Scored callback within seconds."
      buttonLabel="Flag Position"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function AdvanceToRouterAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");
      if (!publicClient) throw new Error("Public client not ready.");

      const caseId = await findLatestCaseByStatus(publicClient, STATUS_SCORED);
      if (caseId === null) {
        throw new Error("No Scored case awaiting routing - flag a position first.");
      }

      // The Router returns debtToCover in [1, closeFactorCap]. Read the
      // borrower's live debt plus the USDC reserve's closeFactorBps from
      // the pool, then compute the upper bound so the agent cannot
      // produce a value that would revert at execute time.
      const [debtBalance, reserveConfig] = await Promise.all([
        publicClient.readContract({
          address: addresses.pool,
          abi: lendingPoolAbi,
          functionName: "debtOf",
          args: [address, addresses.usdc],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: addresses.pool,
          abi: lendingPoolAbi,
          functionName: "reserveConfig",
          args: [addresses.usdc],
        }) as Promise<{ closeFactorBps: number }>,
      ]);

      const maxDebtToCover =
        (debtBalance * BigInt(reserveConfig.closeFactorBps)) / 10_000n;
      if (maxDebtToCover <= 0n) {
        throw new Error("Borrower has no outstanding debt; nothing to route.");
      }

      // Reuse the same verbatim docs-example prompt the Scorer uses so
      // the validator subcommittee converges on a deterministic result.
      // The agent clamps high-positive sentiment to the [1, max] band,
      // which lands at maxDebtToCover - exactly the close-factor cap
      // the Stage-1 Router roadmap targets.
      const sentimentPrompt = "Wonderful day, beautiful weather, everyone happy.";
      const sentimentSystem = "Rate sentiment from 0 (very negative) to 10000 (very positive).";
      const { encodeAbiParameters, keccak256, toHex, concat } = await import("viem");
      const inferNumberSig = "inferNumber(string,string,int256,int256,bool)";
      const selector = keccak256(toHex(inferNumberSig)).slice(0, 10) as `0x${string}`;
      const encoded = encodeAbiParameters(
        [
          { type: "string" },
          { type: "string" },
          { type: "int256" },
          { type: "int256" },
          { type: "bool" },
        ],
        [sentimentPrompt, sentimentSystem, 1n, maxDebtToCover, false],
      );
      const routerPayload = concat([selector, encoded]);

      return walletClient.writeContract({
        address: addresses.coordinator,
        abi: coordinatorAbi,
        functionName: "advanceToRouter",
        args: [caseId, routerPayload],
      });
    });

  return (
    <ActionCard
      title="Advance to Router"
      description="Pushes the latest Scored case into the Router stage. Permissionless on-chain; in the autonomous deployment the Watcher binary does this within milliseconds of seeing the Scored event."
      buttonLabel="Advance to Router"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function ExecuteAction() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient) throw new Error("Wallet not ready.");
      if (!publicClient) throw new Error("Public client not ready.");

      const caseId = await findLatestCaseByStatus(publicClient, STATUS_ROUTED);
      if (caseId === null) {
        throw new Error("No Routed case awaiting execution - advance to router first.");
      }

      // Executor agent ID owned by the deployer wallet in the live
      // Shannon deployment. The Coordinator gates this call on the
      // caller owning an Executor-role agent in AgentRegistry.
      const executorAgentId = 5n;

      return walletClient.writeContract({
        address: addresses.coordinator,
        abi: coordinatorAbi,
        functionName: "execute",
        args: [caseId, executorAgentId],
      });
    });

  return (
    <ActionCard
      title="Execute"
      description="Settles the latest Routed case. Runs LendingPool.liquidate, transfers seized collateral to the Splitter, credits Reputation +100 to all four agents."
      buttonLabel="Execute"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}
