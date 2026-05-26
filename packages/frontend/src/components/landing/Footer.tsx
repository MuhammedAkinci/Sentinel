import { ArrowUpRight } from "lucide-react";

import { Logo } from "~/components/shared/Logo";

const LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "GitHub", href: "https://github.com/MuhammedAkinci/Sentinel" },
  { label: "Somnia Docs", href: "https://docs.somnia.network" },
  { label: "Encode Agentathon", href: "https://www.encodeclub.com/programmes/agentathon" },
  { label: "Shannon Explorer", href: "https://shannon-explorer.somnia.network" },
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
          {LINKS.map((link) => (
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
          ))}
        </nav>
      </div>
    </footer>
  );
}
