"use client";

import { useEffect, useState } from "react";
import { useReducedMotion as fmReducedMotion } from "framer-motion";

export interface TypewriterSequence {
  text: string;
  /** Pause (ms) after typing completes before deleting. */
  holdMs?: number;
  /** Whether to delete the text after holding. */
  deleteAfter?: boolean;
}

export interface TypewriterTitleProps {
  sequences: TypewriterSequence[];
  autoLoop?: boolean;
  /** Adds slight per-keystroke timing randomness to feel human. */
  naturalVariance?: boolean;
  /** Average typing speed in milliseconds per character (default 60). */
  typeSpeedMs?: number;
  /** Average deletion speed in milliseconds per character (default 30). */
  deleteSpeedMs?: number;
  className?: string;
  cursorClassName?: string;
}

function jitter(base: number, variance: boolean): number {
  if (!variance) return base;
  return base * (0.6 + Math.random() * 0.8);
}

export function TypewriterTitle({
  sequences,
  autoLoop = true,
  naturalVariance = true,
  typeSpeedMs = 60,
  deleteSpeedMs = 30,
  className,
  cursorClassName,
}: TypewriterTitleProps) {
  const reduceMotion = fmReducedMotion();
  const [index, setIndex] = useState(0);
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState<"type" | "hold" | "delete">("type");

  useEffect(() => {
    if (reduceMotion) {
      // With reduced motion, just show the first sequence's full text.
      setOutput(sequences[0]?.text ?? "");
      return;
    }

    const seq = sequences[index];
    if (!seq) return;

    if (phase === "type") {
      if (output === seq.text) {
        const wait = seq.holdMs ?? 1400;
        const t = setTimeout(() => setPhase(seq.deleteAfter ? "delete" : "hold"), wait);
        return () => clearTimeout(t);
      }
      const next = seq.text.slice(0, output.length + 1);
      const t = setTimeout(() => setOutput(next), jitter(typeSpeedMs, naturalVariance));
      return () => clearTimeout(t);
    }

    if (phase === "hold") {
      const nextIdx = (index + 1) % sequences.length;
      if (nextIdx === index && !autoLoop) return;
      const t = setTimeout(() => {
        setIndex(nextIdx);
        setPhase("type");
        setOutput("");
      }, 1200);
      return () => clearTimeout(t);
    }

    // delete
    if (output.length === 0) {
      const nextIdx = autoLoop ? (index + 1) % sequences.length : Math.min(index + 1, sequences.length - 1);
      if (!autoLoop && nextIdx === index) return;
      setIndex(nextIdx);
      setPhase("type");
      return;
    }
    const next = seq.text.slice(0, output.length - 1);
    const t = setTimeout(() => setOutput(next), jitter(deleteSpeedMs, naturalVariance));
    return () => clearTimeout(t);
  }, [
    autoLoop,
    deleteSpeedMs,
    index,
    naturalVariance,
    output,
    phase,
    reduceMotion,
    sequences,
    typeSpeedMs,
  ]);

  return (
    <span className={className} aria-live="polite">
      <span>{output}</span>
      <span
        aria-hidden="true"
        className={
          cursorClassName ??
          "ml-1 inline-block h-[1em] w-[0.55ch] translate-y-[0.12em] bg-primary animate-pulse-dot"
        }
      />
    </span>
  );
}
