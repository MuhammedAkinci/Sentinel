"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Logo } from "~/components/shared/Logo";

interface DeckProps {
  slides: ReadonlyArray<{ id: string; render: () => React.ReactNode }>;
}

const SLIDE_VARIANTS: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

/**
 * Slide deck container. Wraps each slide with directional fade/slide
 * transitions and adds the persistent chrome: brand mark at top-left,
 * slide counter at top-right, dot pager + arrow buttons at the bottom,
 * and keyboard support (← / → / Space).
 */
export function Deck({ slides }: DeckProps) {
  const [idx, setIdx] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = (next: number) => {
    if (next === idx || next < 0 || next >= slides.length) return;
    setDirection(next > idx ? 1 : -1);
    setIdx(next);
  };
  const goNext = () => goTo(idx + 1);
  const goPrev = () => goTo(idx - 1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(slides.length - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, slides.length]);

  const slide = slides[idx];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <BackgroundField />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-8 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80" aria-label="Sentinel home">
          <Logo size={24} />
          <span className="text-sm font-medium tracking-tight">Sentinel</span>
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          {String(idx + 1).padStart(2, "0")} <span className="text-foreground/30">/</span>{" "}
          {String(slides.length).padStart(2, "0")}
        </span>
      </header>

      <div className="relative z-10 h-full w-full">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={slide?.id ?? idx}
            custom={direction}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 flex h-full w-full items-center justify-center px-8 sm:px-16"
          >
            {slide?.render()}
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={goPrev}
        disabled={idx === 0}
        aria-label="Previous slide"
        className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-background/60 p-2 text-foreground/60 transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 sm:left-6"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={idx === slides.length - 1}
        aria-label="Next slide"
        className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-border bg-background/60 p-2 text-foreground/60 transition-colors hover:border-primary/60 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 sm:right-6"
      >
        <ChevronRight size={18} />
      </button>

      <div className="absolute inset-x-0 bottom-8 z-20 flex items-center justify-center gap-2">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}`}
            className={`h-1 transition-all duration-300 ${
              i === idx
                ? "w-10 bg-primary"
                : "w-3 bg-muted-foreground/30 hover:bg-muted-foreground/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Brand-coherent ambient background: low-opacity dot grid + a soft
 * primary-tinted radial vignette. Deliberately lightweight - no WebGL
 * here so the deck stays fast across machines.
 */
function BackgroundField() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 50%, rgba(0, 255, 136, 0.08), transparent 70%)",
        }}
      />
    </>
  );
}
