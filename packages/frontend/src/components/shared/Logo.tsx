import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  /** Override the alt text. Defaults to the brand name. */
  alt?: string;
}

/**
 * Sentinel brand mark. Pixel-glitch "S" rendered from a transparent PNG
 * so the dark UI stays free of any introduced background plate. The
 * source asset lives in `public/logo.png` (512x512, brand-green pixels
 * on transparent). Sized in CSS so it stays crisp at retina densities.
 */
export function Logo({ size = 32, className, alt = "Sentinel" }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      priority
      className={className}
      style={{
        width: size,
        height: size,
        // The mark is intentionally clean-edged pixel art. Disable
        // interpolation so downscales preserve the dot pattern instead
        // of smearing it into a haze.
        imageRendering: "pixelated",
      }}
    />
  );
}
