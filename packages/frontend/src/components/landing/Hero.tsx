"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import { BlurText } from "~/components/ui/BlurText";
import { TypewriterTitle } from "~/components/ui/TypewriterTitle";

// FaultyTerminal pulls in OGL + a WebGL context - keep it out of the SSR
// path and the initial JS chunk.
const FaultyTerminal = dynamic(
  () => import("~/components/ui/FaultyTerminal").then((m) => m.FaultyTerminal),
  { ssr: false, loading: () => null },
);

export function Hero() {
  return (
    <section className="relative isolate flex h-[100vh] min-h-[640px] w-full flex-col overflow-hidden">
      {/* WebGL background - keyed once per mount. */}
      <FaultyTerminal
        scale={1.5}
        gridMul={[2, 1]}
        digitSize={1.2}
        timeScale={0.5}
        scanlineIntensity={0.4}
        glitchAmount={0.8}
        flickerAmount={0.7}
        noiseAmp={0.8}
        chromaticAberration={0}
        dither={0}
        curvature={0.05}
        tint="#00FF88"
        mouseReact
        mouseStrength={0.3}
        pageLoadAnimation
        brightness={0.4}
      />

      {/* Subtle vignette grounds the type against the noise without
          masking the pattern in the corners. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 70% at 50% 55%, rgba(10,10,10,0.0), rgba(10,10,10,0.55))",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 sm:px-10">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.32em] text-primary/80">
            Autonomous · L1 native · Watching
          </p>

          <h1 className="mt-6 text-7xl font-bold leading-none tracking-tightest text-foreground sm:text-8xl md:text-9xl">
            <BlurText text="SENTINEL" delay={120} animateBy="letters" direction="top" />
          </h1>

          <div className="mt-8 h-[3.5rem] font-mono text-2xl text-primary md:text-3xl">
            <TypewriterTitle
              sequences={[
                { text: "monitoring positions.", deleteAfter: true },
                { text: "scoring risk.", deleteAfter: true },
                { text: "routing liquidations.", deleteAfter: true },
                { text: "never sleeping.", deleteAfter: true },
              ]}
              autoLoop
              naturalVariance
            />
          </div>

          <p className="mt-10 max-w-xl text-base leading-relaxed text-foreground/80 sm:text-lg">
            Autonomous liquidation network on Somnia&rsquo;s Agentic L1. Watcher,
            Scorer, Router, Executor and Splitter - all on-chain, settled at
            sub-second validator consensus latency.
          </p>

          <div className="mt-10 flex items-center gap-4">
            <Link
              href="/dashboard"
              className="group inline-flex items-center gap-2 border border-primary px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-background"
            >
              Open Dashboard
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-2 py-3 text-sm text-foreground/70 transition-colors hover:text-foreground"
            >
              How it works
            </a>
          </div>
        </div>
      </div>

      {/* Subtle scroll hint at the bottom. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
        <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">
          scroll
        </span>
      </div>
    </section>
  );
}
