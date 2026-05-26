"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "./Logo";

export function LandingNav() {
  return (
    <nav className="absolute inset-x-0 top-0 z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
      <Link href="/" className="flex items-center gap-3" aria-label="Sentinel home">
        <Logo size={28} />
        <span className="text-sm font-medium tracking-tight">Sentinel</span>
      </Link>

      <div className="hidden items-center gap-7 text-sm md:flex">
        <a href="#architecture" className="text-foreground/80 transition-colors hover:text-foreground">
          Architecture
        </a>
        <a
          href="https://github.com/MuhammedAkinci/Sentinel/tree/main/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
        >
          Docs <ArrowUpRight size={12} />
        </a>
        <a
          href="https://github.com/MuhammedAkinci/Sentinel"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-foreground/80 transition-colors hover:text-foreground"
        >
          GitHub <ArrowUpRight size={12} />
        </a>
      </div>

      <Link
        href="/dashboard"
        className="group inline-flex items-center gap-2 border border-primary/60 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-background"
      >
        Open Dashboard
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    </nav>
  );
}
