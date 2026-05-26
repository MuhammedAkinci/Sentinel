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

export function DemoControls() {
  const { address } = useAccount();
  const expectedDeployer = env.NEXT_PUBLIC_DEPLOYER_ADDRESS;
  const isConnected = !!address;
  const isDeployer =
    isConnected &&
    !!expectedDeployer &&
    address.toLowerCase() === expectedDeployer.toLowerCase();

  return <DemoControlsBody isConnected={isConnected} isDeployer={isDeployer} expectedDeployer={expectedDeployer} />;
}

function DemoControlsBody({
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
      title="Demo Controls"
      subtitle="Drive a full Sentinel case end-to-end. Oracle setters and flagPosition require the deployer wallet; faucet mint plus deposit and borrow work for any account."
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
                Connect a wallet to submit demo transactions.
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
                <span className="text-foreground">Open Position</span>: reset oracle to $3,000, mint 10 WETH, deposit, borrow 15,000 USDC. Five signatures.
              </li>
              <li>
                <span className="text-foreground">Crash Oracle</span>: drop WETH to $1,800 so HF falls below 1. The position is now liquidatable.
              </li>
              <li>
                <span className="text-foreground">Trigger flagPosition</span>: submit a docs-example llm-inference prompt. Coordinator dispatches a Somnia native createRequest; the Scored callback should land within a second.
              </li>
              <li>
                <span className="text-foreground">Reset Oracle</span> when you want to start a fresh take.
              </li>
            </ol>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-2">
            <OpenPositionAction />
            <CrashOracleAction />
            <ResetOracleAction />
            <FlagPositionAction />
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
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");
      const tenWeth = parseUnits("10", 18);
      const fifteenK = parseUnits("15000", 6);
      const healthyEthPrice = parseUnits("3000", 18);

      // The borrow only fits if ETH is at its healthy price. Reset the
      // oracle first so any prior demo crash does not block the new
      // position.
      await walletClient.writeContract({
        address: addresses.oracle,
        abi: priceOracleAdapterAbi,
        functionName: "setOverridePrice",
        args: [addresses.weth, healthyEthPrice],
      });
      await walletClient.writeContract({
        address: addresses.weth,
        abi: mintableErc20Abi,
        functionName: "mint",
        args: [address, tenWeth],
      });
      await walletClient.writeContract({
        address: addresses.weth,
        abi: mintableErc20Abi,
        functionName: "approve",
        args: [addresses.pool, tenWeth],
      });
      await walletClient.writeContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "deposit",
        args: [addresses.weth, tenWeth],
      });
      const borrowHash = await walletClient.writeContract({
        address: addresses.pool,
        abi: lendingPoolAbi,
        functionName: "borrow",
        args: [addresses.usdc, fifteenK],
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
  const { data: walletClient } = useWalletClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient) throw new Error("Wallet not ready.");
      // Override WETH price to $1,800 in 18-decimal scale.
      const price = parseUnits("1800", 18);
      return walletClient.writeContract({
        address: addresses.oracle,
        abi: priceOracleAdapterAbi,
        functionName: "setOverridePrice",
        args: [addresses.weth, price],
      });
    });

  return (
    <ActionCard
      title="Crash Oracle"
      description="Override WETH price to $1,800. Existing positions should drop to HF < 1."
      buttonLabel="Crash to $1,800"
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
      description="Restore WETH price to $3,000 between demo runs."
      buttonLabel="Reset to $3,000"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}

function FlagPositionAction() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { state, result, run } = useAction();

  const onClick = () =>
    run(async () => {
      if (!walletClient || !address) throw new Error("Wallet not ready.");

      // Build the same llm-inference inferNumber payload the docs example
      // uses. Returns score 10000 reliably.
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
      description="Submit a docs-example llm-inference prompt with watcherAgentId=2. Expect a Scored callback within one second."
      buttonLabel="Flag Position"
      state={state}
      result={result}
      onClick={onClick}
    />
  );
}
