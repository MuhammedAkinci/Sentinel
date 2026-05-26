"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Eye, Scale, Route, Zap } from "lucide-react";

import { BlurText } from "~/components/ui/BlurText";

/* -------------------------------------------------------------------------- */
/*                                 Slide deck                                 */
/* -------------------------------------------------------------------------- */

export const PITCH_SLIDES: ReadonlyArray<{
  id: string;
  render: () => React.ReactNode;
}> = [
  { id: "cover", render: () => <CoverSlide /> },
  { id: "problem", render: () => <ProblemSlide /> },
  { id: "solution", render: () => <SolutionSlide /> },
  { id: "pipeline", render: () => <PipelineSlide /> },
  { id: "demo", render: () => <DemoSlide /> },
  { id: "closing", render: () => <ClosingSlide /> },
];

/* -------------------------------------------------------------------------- */
/*                                  1. Cover                                  */
/* -------------------------------------------------------------------------- */

function CoverSlide() {
  return (
    <div className="flex max-w-5xl flex-col items-center text-center">
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="font-mono text-xs uppercase tracking-[0.4em] text-primary/80"
      >
        Autonomous · L1 native · Watching
      </motion.p>

      <h1 className="mt-8 text-7xl font-bold leading-none tracking-tightest sm:text-9xl">
        <BlurText text="SENTINEL" delay={100} animateBy="letters" direction="top" />
      </h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.6 }}
        className="mt-10 font-mono text-base uppercase tracking-[0.32em] text-primary sm:text-lg"
      >
        Watching. Never sleeping.
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.8, duration: 0.6 }}
        className="mt-6 max-w-xl text-base text-foreground/70 sm:text-lg"
      >
        Autonomous liquidation network on Somnia&rsquo;s Agentic L1.
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.1, duration: 0.5 }}
        className="mt-16 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground print:hidden"
      >
        <span>Press</span>
        <kbd className="rounded-sm border border-border bg-muted/40 px-2 py-1 text-foreground/80">→</kbd>
        <span>to advance</span>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 2. Problem                                 */
/* -------------------------------------------------------------------------- */

function ProblemSlide() {
  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-16 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <SlideKicker label="The gap" />
        <SlideHeadline>
          Liquidations <span className="text-primary">win in the dark.</span>
        </SlideHeadline>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 max-w-xl text-lg leading-relaxed text-foreground/75"
        >
          Today&rsquo;s liquidations are decided in private bot servers, raced
          on private mempools, and settled with no public reasoning. Borrowers
          have no proof. Protocols have no oversight.
        </motion.p>
      </div>

      <div className="lg:col-span-5">
        <ul className="space-y-5">
          {[
            "Decisions are opaque.",
            "Races leak value to a few operators.",
            "There is no on-chain accountability.",
          ].map((line, i) => (
            <motion.li
              key={line}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
              className="border-l-2 border-danger/50 pl-5 text-base text-foreground/85"
            >
              {line}
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 3. Solution                                */
/* -------------------------------------------------------------------------- */

function SolutionSlide() {
  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-16 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <SlideKicker label="What we built" />
        <SlideHeadline>
          Sentinel brings them <span className="text-primary">on chain.</span>
        </SlideHeadline>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-8 max-w-xl text-lg leading-relaxed text-foreground/75"
        >
          Four specialised agents coordinate around a single on-chain
          orchestrator. Scoring and routing run on Somnia&rsquo;s validator
          subcommittee. Every transition is an event the world can verify.
        </motion.p>
      </div>

      <div className="lg:col-span-5">
        <ul className="space-y-5">
          {[
            { value: "1s", label: "validator consensus latency" },
            { value: "0", label: "private decisions in the loop" },
            { value: "100%", label: "of receipts on chain" },
          ].map((stat, i) => (
            <motion.li
              key={stat.label}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.15, duration: 0.5 }}
              className="border-l-2 border-primary/50 pl-5"
            >
              <div className="font-mono text-3xl font-medium text-foreground">
                {stat.value}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                {stat.label}
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              4. Pipeline visual                            */
/* -------------------------------------------------------------------------- */

const AGENTS = [
  {
    name: "Watcher",
    surface: "Off-chain",
    desc: "Watches positions over WSS.",
    Icon: Eye,
    accent: "#7DD3FC",
  },
  {
    name: "Scorer",
    surface: "Somnia native",
    desc: "Validator-consensus risk score.",
    Icon: Scale,
    accent: "#FBBF24",
  },
  {
    name: "Router",
    surface: "Somnia native",
    desc: "Validator-consensus debt-to-cover.",
    Icon: Route,
    accent: "#A78BFA",
  },
  {
    name: "Executor",
    surface: "Off-chain",
    desc: "Races to settle the liquidation.",
    Icon: Zap,
    accent: "#34D399",
  },
] as const;

function PipelineSlide() {
  return (
    <div className="flex w-full max-w-6xl flex-col">
      <SlideKicker label="How it works" />
      <SlideHeadline>
        Four agents. <span className="text-primary">One pipeline.</span>
      </SlideHeadline>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground/75"
      >
        Detection and execution where milliseconds win. Scoring and routing
        where trust wins. Every decision settles in a single second.
      </motion.p>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-4">
        {AGENTS.map((agent, i) => (
          <motion.div
            key={agent.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + i * 0.12, duration: 0.45 }}
            className="relative border border-border bg-background/60 p-5"
          >
            <div
              className="absolute -top-3 left-5 bg-background px-2 font-mono text-[10px] uppercase tracking-[0.24em]"
              style={{ color: agent.accent }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <agent.Icon size={22} style={{ color: agent.accent }} aria-hidden="true" />
            <h3 className="mt-4 text-lg font-semibold tracking-tight">{agent.name}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              {agent.surface}
            </p>
            <p className="mt-3 text-sm leading-snug text-foreground/80">{agent.desc}</p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="mt-10 flex items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground"
      >
        <span>flag</span>
        <Arrow />
        <span className="text-primary">score</span>
        <Arrow />
        <span className="text-primary">route</span>
        <Arrow />
        <span>execute</span>
        <Arrow />
        <span>settle</span>
      </motion.div>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden="true" className="text-foreground/40">
      →
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 5. Demo                                    */
/* -------------------------------------------------------------------------- */

function DemoSlide() {
  return (
    <div className="flex w-full max-w-6xl flex-col items-center">
      <div className="w-full">
        <SlideKicker label="See it run" centered />
        <SlideHeadline centered>
          From flag to <span className="text-primary">settled.</span>
        </SlideHeadline>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="mt-12 w-full"
      >
        <div className="relative w-full overflow-hidden border border-border bg-background/80">
          <video
            className="aspect-video w-full bg-background object-cover"
            controls
            preload="metadata"
            playsInline
            poster="/icon-512.png"
            src="/demo.mp4"
          >
            Your browser does not support embedded video.
          </video>
          <div className="flex items-center justify-between border-t border-border px-5 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <span>Open Position · Crash Oracle · Flag · Advance · Execute · Close</span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open dashboard <ArrowUpRight size={10} />
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 6. Closing                                 */
/* -------------------------------------------------------------------------- */

function ClosingSlide() {
  return (
    <div className="flex max-w-4xl flex-col items-center text-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <SlideKicker label="Sentinel" centered />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl"
      >
        Watching. <span className="text-primary">Never sleeping.</span>
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
        className="mt-6 max-w-xl text-base text-foreground/70 sm:text-lg"
      >
        Built on Somnia&rsquo;s Agentic L1.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.5 }}
        className="mt-14 flex flex-wrap items-center justify-center gap-4 print:hidden"
      >
        <Link
          href="/dashboard"
          className="group inline-flex items-center gap-2 border border-primary px-5 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-background"
        >
          Open Dashboard
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 border border-border px-5 py-3 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/60 hover:text-foreground"
        >
          Read the docs
        </Link>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Slide primitives                            */
/* -------------------------------------------------------------------------- */

function SlideKicker({ label, centered = false }: { label: string; centered?: boolean }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.45 }}
      className={[
        "font-mono text-[11px] uppercase tracking-[0.32em] text-primary/80",
        centered ? "text-center" : "",
      ].join(" ")}
    >
      {label}
    </motion.p>
  );
}

function SlideHeadline({
  children,
  centered = false,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className={[
        "mt-4 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl",
        centered ? "text-center" : "",
      ].join(" ")}
    >
      {children}
    </motion.h2>
  );
}
