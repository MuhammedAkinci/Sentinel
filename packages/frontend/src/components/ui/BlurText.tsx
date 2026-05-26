"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";

type AnimateBy = "letters" | "words";
type Direction = "top" | "bottom" | "left" | "right";

export interface BlurTextProps {
  text: string;
  delay?: number; // milliseconds between tokens
  animateBy?: AnimateBy;
  direction?: Direction;
  className?: string;
}

const offset: Record<Direction, { x: number; y: number }> = {
  top: { x: 0, y: -16 },
  bottom: { x: 0, y: 16 },
  left: { x: -16, y: 0 },
  right: { x: 16, y: 0 },
};

export function BlurText({
  text,
  delay = 60,
  animateBy = "letters",
  direction = "top",
  className,
}: BlurTextProps) {
  const reduceMotion = useReducedMotion();
  const tokens = animateBy === "words" ? text.split(/(\s+)/) : Array.from(text);

  const { x, y } = offset[direction];

  const variants: Variants = {
    hidden: reduceMotion
      ? { opacity: 1, x: 0, y: 0, filter: "blur(0px)" }
      : { opacity: 0, x, y, filter: "blur(8px)" },
    shown: { opacity: 1, x: 0, y: 0, filter: "blur(0px)" },
  };

  return (
    <span className={className} aria-label={text}>
      {tokens.map((tok, i) => {
        if (tok === " " || tok === "\n") {
          return (
            <span key={`s-${i}`} aria-hidden="true">
              {tok === "\n" ? <br /> : " "}
            </span>
          );
        }
        return (
          <motion.span
            key={`${tok}-${i}`}
            aria-hidden="true"
            variants={variants}
            initial="hidden"
            animate="shown"
            transition={{
              duration: 0.6,
              ease: [0.16, 1, 0.3, 1],
              delay: (i * delay) / 1000,
            }}
            style={{ display: "inline-block", willChange: "transform, filter, opacity" }}
          >
            {tok}
          </motion.span>
        );
      })}
    </span>
  );
}
