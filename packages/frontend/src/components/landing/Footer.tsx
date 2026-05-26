import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "~/components/shared/Logo";

interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

const LINKS: ReadonlyArray<NavLink> = [
  { label: "Docs", href: "/docs" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Somnia Docs", href: "https://docs.somnia.network", external: true },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-8 px-6 py-12 sm:px-10 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <Logo size={24} />
          <div>
            <div className="text-sm font-medium">Sentinel</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
              Watching. Never sleeping.
            </div>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
          {LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
              >
                {link.label}
                <ArrowUpRight size={12} />
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
