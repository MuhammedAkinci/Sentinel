interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Geometric mark - inverted halftone field that condenses the
 * Sentinel-visibility motif into an icon. Pure SVG, no raster
 * dependencies. The gradient stops are baked at design time so the file
 * is render-deterministic.
 */
export function Logo({ size = 32, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Sentinel"
      role="img"
    >
      <rect width="32" height="32" rx="2" fill="#0A0A0A" />
      <g fill="#00FF88">
        {/* Halftone matrix: 4x4 dots with falling radii from top-left to bottom-right. */}
        <circle cx="6" cy="6" r="2.6" />
        <circle cx="13" cy="6" r="2.2" />
        <circle cx="20" cy="6" r="1.8" />
        <circle cx="26" cy="6" r="1.0" opacity="0.6" />
        <circle cx="6" cy="13" r="2.2" />
        <circle cx="13" cy="13" r="1.8" />
        <circle cx="20" cy="13" r="1.0" opacity="0.6" />
        <circle cx="26" cy="13" r="0.5" opacity="0.4" />
        <circle cx="6" cy="20" r="1.8" />
        <circle cx="13" cy="20" r="1.0" opacity="0.6" />
        <circle cx="20" cy="20" r="0.5" opacity="0.4" />
        <circle cx="6" cy="26" r="1.0" opacity="0.6" />
        <circle cx="13" cy="26" r="0.5" opacity="0.4" />
      </g>
    </svg>
  );
}
