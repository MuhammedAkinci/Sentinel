"use client";

import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

/**
 * FaultyTerminal - a fullscreen GLSL shader background that renders a
 * digital-noise terminal field with optional curvature, chromatic
 * aberration, dithering, and mouse interaction. Designed to be lazy
 * loaded; ssr-disabled at the import site.
 *
 * The fragment shader was hand-tuned for this project. It performs the
 * following stack:
 *   1. Build a UV grid mod `gridMul` and quantise time into discrete
 *      cells controlled by `timeScale` and `noiseAmp`.
 *   2. Sample a hash-based noise field per cell that randomly flickers
 *      based on `flickerAmount`.
 *   3. Apply CRT scanlines (`scanlineIntensity`), barrel curvature
 *      (`curvature`), and a chromatic aberration ramp.
 *   4. Optionally bias the field toward the mouse position with strength
 *      `mouseStrength`.
 *   5. Mix the final greyscale field with the configured `tint` colour
 *      and `brightness` scalar.
 *
 * The page-load animation fades brightness from zero to its configured
 * value over 1.2 seconds, sympathetic to `prefers-reduced-motion`.
 */
export interface FaultyTerminalProps {
  scale?: number;
  gridMul?: [number, number];
  digitSize?: number;
  timeScale?: number;
  scanlineIntensity?: number;
  glitchAmount?: number;
  flickerAmount?: number;
  noiseAmp?: number;
  chromaticAberration?: number;
  dither?: number;
  curvature?: number;
  tint?: string;
  mouseReact?: boolean;
  mouseStrength?: number;
  pageLoadAnimation?: boolean;
  brightness?: number;
  className?: string;
}

const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uScale;
uniform vec2  uGridMul;
uniform float uDigitSize;
uniform float uTimeScale;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3  uTint;
uniform vec2  uMouse;
uniform float uMouseStrength;
uniform float uMouseReact;
uniform float uBrightness;
uniform float uLoadProgress;
uniform float uDpr;

out vec4 fragColor;

// Cheap hash function.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Quantised noise sample per cell.
float cellNoise(vec2 cell, float t) {
  float h = hash(cell + vec2(floor(t * 13.0)));
  return mix(0.4, 1.0, h);
}

vec2 barrel(vec2 uv, float strength) {
  vec2 cc = uv - 0.5;
  float dist = dot(cc, cc);
  return uv + cc * dist * strength;
}

void main() {
  // gl_FragCoord is in device pixels; divide by dpr so the rest of the
  // shader reasons in CSS pixels and uv falls in [0, 1] across the
  // whole canvas regardless of devicePixelRatio.
  vec2 frag = gl_FragCoord.xy / uDpr;
  vec2 uv = frag / uResolution.xy;

  // Curvature pass.
  uv = barrel(uv, uCurvature);

  // Cell grid.
  vec2 cellSize = vec2(uDigitSize) * uGridMul * uScale;
  vec2 cell = floor((uv * uResolution.xy) / cellSize);
  vec2 cellUv = fract((uv * uResolution.xy) / cellSize);

  float t = uTime * uTimeScale;

  // Per-cell base value.
  float n = cellNoise(cell, t) * uNoiseAmp;

  // Flicker: random per-cell, per-frame.
  float flicker = step(1.0 - uFlickerAmount, hash(cell + floor(t * 30.0)));
  n *= mix(1.0, 0.2, flicker);

  // Mouse react: brighten cells near mouse.
  if (uMouseReact > 0.5) {
    float dm = distance(uv, uMouse);
    n += smoothstep(0.45, 0.0, dm) * uMouseStrength;
  }

  // CRT scanlines.
  float scan = sin((uv.y + t * 0.4) * uResolution.y * 1.2) * 0.5 + 0.5;
  n *= mix(1.0, scan, uScanlineIntensity);

  // Glitch: occasional horizontal jitter band.
  float gband = step(0.985, hash(vec2(floor(t * 6.0), 0.0)));
  if (gband > 0.5) {
    float shift = (hash(vec2(floor(uv.y * 60.0), floor(t * 60.0))) - 0.5) * uGlitchAmount * 0.2;
    n *= 1.0 + sin(uv.y * 800.0 + t * 50.0) * shift;
  }

  // Dot pattern inside the cell - gives the readable terminal look.
  vec2 dotCenter = abs(cellUv - 0.5);
  float dotMask = step(max(dotCenter.x, dotCenter.y), 0.42);
  n *= dotMask;

  // Out-of-bounds (post-barrel) → black.
  float bounds = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  n *= bounds;

  // Chromatic aberration: horizontally shift the green/blue channels.
  float ca = uChromaticAberration * 0.004;
  float r = n;
  float g = cellNoise(cell, t + ca * 60.0) * uNoiseAmp * dotMask * bounds;
  float b = cellNoise(cell, t + ca * 120.0) * uNoiseAmp * dotMask * bounds;

  vec3 col = vec3(r, g, b);

  // Tint mix.
  col = mix(col, uTint * (r * 0.6 + 0.4), 0.9);

  // Dither (use device-pixel frag to keep noise sharp on retina).
  float dnoise = (hash(gl_FragCoord.xy + floor(t * 60.0)) - 0.5) * uDither * 0.05;
  col += dnoise;

  // Brightness + load fade.
  col *= uBrightness * uLoadProgress;

  fragColor = vec4(col, 1.0);
}
`;

const VERTEX_SHADER = /* glsl */ `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

function hexToVec3(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  const value = m[1] ?? "ffffff";
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return [r, g, b];
}

export function FaultyTerminal(props: FaultyTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef<[number, number]>([0.5, 0.5]);

  const {
    scale = 1,
    gridMul = [1, 1],
    digitSize = 1,
    timeScale = 1,
    scanlineIntensity = 0.4,
    glitchAmount = 0.5,
    flickerAmount = 0.3,
    noiseAmp = 1,
    chromaticAberration = 0,
    dither = 0,
    curvature = 0,
    tint = "#00FF88",
    mouseReact = false,
    mouseStrength = 0.2,
    pageLoadAnimation = true,
    brightness = 1,
    className,
  } = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true,
      antialias: false,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    container.appendChild(canvas);

    const tintVec = hexToVec3(tint);
    const startTime = performance.now();

    const program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1] as [number, number] },
        uScale: { value: scale },
        uGridMul: { value: gridMul },
        uDigitSize: { value: 12 * digitSize },
        uTimeScale: { value: timeScale },
        uScanlineIntensity: { value: scanlineIntensity },
        uGlitchAmount: { value: glitchAmount },
        uFlickerAmount: { value: flickerAmount },
        uNoiseAmp: { value: noiseAmp },
        uChromaticAberration: { value: chromaticAberration },
        uDither: { value: dither },
        uCurvature: { value: curvature },
        uTint: { value: tintVec },
        uMouse: { value: [0.5, 0.5] as [number, number] },
        uMouseStrength: { value: mouseStrength },
        uMouseReact: { value: mouseReact ? 1 : 0 },
        uBrightness: { value: brightness },
        uLoadProgress: { value: pageLoadAnimation ? 0 : 1 },
        uDpr: { value: Math.min(window.devicePixelRatio, 2) },
      },
    });

    const geometry = new Triangle(gl);
    const mesh = new Mesh(gl, { geometry, program });

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      // uResolution is CSS pixels; the shader scales gl_FragCoord by uDpr
      // before dividing, so uv hits [0, 1] across the entire canvas.
      program.uniforms.uResolution.value = [w, h];
      program.uniforms.uDpr.value = Math.min(window.devicePixelRatio, 2);
    };
    resize();

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseReact) return;
      const rect = container.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = 1 - (e.clientY - rect.top) / rect.height;
      mouseRef.current = [mx, my];
    };
    if (mouseReact) window.addEventListener("mousemove", onMouseMove);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let rafId = 0;
    const tick = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      program.uniforms.uTime.value = elapsed;

      if (pageLoadAnimation && !prefersReducedMotion) {
        program.uniforms.uLoadProgress.value = Math.min(1, elapsed / 1.2);
      } else {
        program.uniforms.uLoadProgress.value = 1;
      }

      const [mx, my] = mouseRef.current;
      const prev = program.uniforms.uMouse.value as [number, number];
      // Ease toward target mouse position.
      program.uniforms.uMouse.value = [
        prev[0] + (mx - prev[0]) * 0.08,
        prev[1] + (my - prev[1]) * 0.08,
      ];

      renderer.render({ scene: mesh });
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      if (mouseReact) window.removeEventListener("mousemove", onMouseMove);
      if (canvas.parentElement === container) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // FaultyTerminal is configured once at mount; props are intentionally
    // not part of the dependency array to avoid tearing down the WebGL
    // context on each re-render. Treat props as initial values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className ?? "absolute inset-0 h-full w-full"}
    />
  );
}
