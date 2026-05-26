import type { ConnectionState } from "~/hooks/useContractEvents";

const STATE_COPY: Record<ConnectionState, { label: string; dot: string }> = {
  connecting: { label: "Connecting…", dot: "bg-muted-foreground" },
  connected: { label: "Shannon Testnet", dot: "bg-primary" },
  reconnecting: { label: "Reconnecting…", dot: "bg-danger" },
  error: { label: "WSS error", dot: "bg-danger" },
};

export function NetworkStatus({ wssStatus }: { wssStatus: ConnectionState }) {
  const copy = STATE_COPY[wssStatus];
  return (
    <div className="hidden items-center gap-2 rounded-sm border border-border bg-muted/60 px-3 py-1.5 md:flex">
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 ${copy.dot} ${
          wssStatus === "connected" ? "animate-pulse-dot" : ""
        }`}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/80">
        {copy.label}
      </span>
    </div>
  );
}
