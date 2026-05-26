"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

import { addresses } from "~/lib/env";
import { coordinatorAbi } from "~/lib/abis";

interface LiveMetrics {
  totalCases: string;
  depositSomi: number;
}

const STATIC_LATENCY_LABEL = "1s";

export function Metrics() {
  const client = usePublicClient();

  const { data } = useQuery<LiveMetrics>({
    enabled: !!client,
    queryKey: ["landing-metrics"],
    queryFn: async () => {
      if (!client) throw new Error("no client");
      const [nextCaseId, perRequestDeposit] = await Promise.all([
        client.readContract({
          address: addresses.coordinator,
          abi: coordinatorAbi,
          functionName: "nextCaseId",
        }) as Promise<bigint>,
        client.readContract({
          address: addresses.coordinator,
          abi: coordinatorAbi,
          functionName: "perRequestDeposit",
        }) as Promise<bigint>,
      ]);
      const totalCases = nextCaseId > 0n ? nextCaseId - 1n : 0n;
      return {
        totalCases: totalCases.toString(),
        depositSomi: Number(perRequestDeposit) / 1e18,
      };
    },
    staleTime: 60_000,
  });

  const items: Array<{ value: string; label: string }> = [
    { value: STATIC_LATENCY_LABEL, label: "validator consensus latency" },
    { value: data?.totalCases ?? "-", label: "cases coordinated on Shannon" },
    {
      value: data?.depositSomi ? `${data.depositSomi.toFixed(2)} STT` : "-",
      label: "per-request platform deposit",
    },
  ];

  return (
    <section className="border-y border-border bg-background/60">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className="px-6 py-12 sm:px-10">
            <div className="font-mono text-5xl font-medium text-foreground sm:text-6xl">
              {item.value}
            </div>
            <div className="mt-3 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
