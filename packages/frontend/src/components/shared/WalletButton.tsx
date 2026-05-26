"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, Wallet } from "lucide-react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { supportedChain } from "~/lib/wagmi";
import { shortAddress, explorer } from "~/lib/utils";

/**
 * Lightweight wallet connect button that talks to wagmi directly.
 *
 * Disconnected state opens an inline picker listing every injected wallet
 * wagmi has discovered (EIP-6963 announcements plus the configured
 * connector). This avoids the situation where an aggressive wallet
 * (Phantom, Brave) hijacks `window.ethereum` and there is no way to
 * choose MetaMask explicitly.
 *
 * Connected state shows the address chip with a small disconnect menu.
 * Wrong-chain state offers a switch-to-Shannon button instead.
 */
export function WalletButton() {
  const { address, status, chainId } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close any popover on outside click.
  useEffect(() => {
    if (!pickerOpen && !menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [pickerOpen, menuOpen]);

  const wrongChain = !!address && chainId !== supportedChain.id;
  const available = uniqueConnectors(connectors);

  if (!address) {
    return (
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={isPending || status === "connecting"}
          className="inline-flex items-center gap-2 border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Wallet size={14} />
          {isPending || status === "connecting" ? "Connecting..." : "Connect Wallet"}
        </button>
        {pickerOpen ? (
          <div className="absolute right-0 top-full z-40 mt-2 w-64 border border-border bg-background shadow-xl">
            <div className="border-b border-border px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Select wallet
            </div>
            {available.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground">
                No injected wallets detected. Install MetaMask or Rabby.
              </div>
            ) : (
              <ul>
                {available.map((connector) => (
                  <li key={connector.uid}>
                    <button
                      type="button"
                      onClick={async () => {
                        setPickerOpen(false);
                        try {
                          await connectAsync({ connector });
                        } catch {
                          // user rejected or wallet failed to handshake
                        }
                      }}
                      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted"
                    >
                      <ConnectorIcon connector={connector} />
                      <span className="flex-1 truncate">{connector.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                        {connector.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  if (wrongChain) {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            await switchChainAsync({ chainId: supportedChain.id });
          } catch {
            // user rejected
          }
        }}
        className="inline-flex items-center gap-2 border border-danger px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-background"
      >
        Switch to Shannon
      </button>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="inline-flex items-center gap-2 border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground transition-colors hover:border-primary/60 hover:text-primary"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 bg-primary" />
        {shortAddress(address)}
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 border border-border bg-background shadow-xl">
          <a
            href={explorer.address(address)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between border-b border-border px-4 py-3 text-xs text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            <span className="font-mono">{shortAddress(address, 8, 6)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              view
            </span>
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs text-danger hover:bg-danger/10"
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConnectorIcon({ connector }: { connector: Connector }) {
  const icon = (connector as Connector & { icon?: string }).icon;
  if (icon) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-sm bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" className="h-full w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-muted text-[11px] font-medium uppercase text-foreground/70"
    >
      {connector.name.slice(0, 2)}
    </span>
  );
}

/**
 * Deduplicate connectors by display name. wagmi often exposes both the
 * configured fallback (e.g. the generic Injected) and an EIP-6963
 * discovery (named MetaMask, Phantom, etc.). Hide the fallback if a
 * named provider is already in the list and avoid double-listing wallets
 * that announce themselves under several rdns hints.
 */
function uniqueConnectors(connectors: readonly Connector[]): Connector[] {
  const namedSeen = new Set<string>();
  const out: Connector[] = [];
  for (const c of connectors) {
    if (c.type !== "injected") {
      out.push(c);
      continue;
    }
    const name = c.name.toLowerCase();
    // Skip the generic 'Injected' fallback when at least one named EIP-6963
    // wallet is present.
    if (name === "injected") continue;
    if (namedSeen.has(name)) continue;
    namedSeen.add(name);
    out.push(c);
  }
  // If we filtered everything out, fall back to whatever wagmi gave us.
  if (out.length === 0 && connectors.length > 0) return [...connectors];
  return out;
}
