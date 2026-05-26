"use client";

import { MotionConfig } from "framer-motion";

import { PITCH_SLIDES } from "~/components/pitch/slides";

/**
 * Print-friendly variant of the pitch deck.
 *
 * Renders every slide stacked vertically, one viewport per slide, with
 * a CSS `break-after: page` between each so the browser's print dialog
 * (Cmd+P -> Save as PDF) outputs one slide per page.
 *
 * Animations are intentionally suppressed via MotionConfig
 * `reducedMotion="always"`. framer-motion respects that flag by
 * skipping transitions entirely and rendering each motion component
 * straight to its `animate` end state, so the PDF snapshot captures the
 * fully composed layout instead of the initial (often hidden) state.
 */
export default function PitchPrintPage() {
  return (
    <MotionConfig reducedMotion="always">
      <div className="print-deck bg-background text-foreground">
        {PITCH_SLIDES.map((slide) => (
          <section
            key={slide.id}
            className="print-slide relative flex h-screen w-screen items-center justify-center overflow-hidden px-8 sm:px-16"
          >
            <BackgroundField />
            <div className="relative z-10 flex w-full justify-center">
              {slide.render()}
            </div>
          </section>
        ))}
        <style jsx global>{`
          /* The framer-motion override lives in globals.css so the
             rule loads with the Tailwind base layer and beats any
             inline styles styled-jsx might fail to scope. This block
             only carries print-mode chrome. */
          @page {
            size: 1920px 1080px;
            margin: 0;
          }
          @media print {
            html,
            body {
              background: #0a0a0a !important;
              color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .print-slide {
              break-after: page;
              page-break-after: always;
              width: 1920px !important;
              height: 1080px !important;
              max-width: 1920px !important;
              max-height: 1080px !important;
            }
            .print-slide:last-child {
              break-after: auto;
              page-break-after: auto;
            }
          }
        `}</style>
      </div>
    </MotionConfig>
  );
}

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
