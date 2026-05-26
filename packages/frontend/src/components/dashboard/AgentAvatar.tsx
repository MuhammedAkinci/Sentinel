import type { AgentRoleKey } from "~/lib/agentPersonas";
import { AGENT_PERSONAS } from "~/lib/agentPersonas";

interface AgentAvatarProps {
  role: AgentRoleKey;
  size?: number;
  className?: string;
  active?: boolean;
}

/**
 * Geometric portrait per Sentinel agent role. Avatars are deterministic
 * SVGs that condense the agent's philosophical motif into a 56x56 mark:
 *   Watcher  - concentric rings around a vigilant aperture.
 *   Scorer   - calibrated balance scale ticking in equal halves.
 *   Router   - branching path forking at the optimal cut.
 *   Executor - decisive single stroke striking through the field.
 *
 * Each avatar is tinted with the persona's accent colour but pure SVG so
 * it stays crisp at any size and renders in SSR.
 */
export function AgentAvatar({ role, size = 56, className, active }: AgentAvatarProps) {
  const persona = AGENT_PERSONAS[role];
  const accent = persona.accent;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${persona.callSign} - ${persona.role}`}
      className={className}
    >
      <rect width="56" height="56" rx="2" fill="#0A0A0A" />
      <rect
        x="0.5"
        y="0.5"
        width="55"
        height="55"
        rx="1.5"
        stroke={active ? accent : "rgba(240,240,240,0.08)"}
        strokeWidth="1"
      />
      <PortraitFor role={role} accent={accent} />
    </svg>
  );
}

function PortraitFor({ role, accent }: { role: AgentRoleKey; accent: string }) {
  const muted = "rgba(240,240,240,0.25)";
  switch (role) {
    case "Watcher":
      // Concentric rings around an aperture - the disciplined eye.
      return (
        <g stroke={accent} strokeWidth="1.4" fill="none">
          <circle cx="28" cy="28" r="20" stroke={muted} />
          <circle cx="28" cy="28" r="14" />
          <circle cx="28" cy="28" r="8" />
          <circle cx="28" cy="28" r="3" fill={accent} stroke="none" />
          <line x1="28" y1="6" x2="28" y2="12" />
          <line x1="28" y1="44" x2="28" y2="50" />
          <line x1="6" y1="28" x2="12" y2="28" />
          <line x1="44" y1="28" x2="50" y2="28" />
        </g>
      );
    case "Scorer":
      // Balance scale: pivot, beam, pans.
      return (
        <g stroke={accent} strokeWidth="1.4" fill="none">
          <line x1="28" y1="10" x2="28" y2="46" stroke={muted} />
          <line x1="14" y1="22" x2="42" y2="22" />
          <path d="M14 22 L10 34 L18 34 Z" fill="rgba(251,191,36,0.18)" />
          <path d="M42 22 L38 34 L46 34 Z" fill="rgba(251,191,36,0.18)" />
          <circle cx="28" cy="22" r="2" fill={accent} stroke="none" />
          <line x1="22" y1="46" x2="34" y2="46" stroke={muted} />
        </g>
      );
    case "Router":
      // Fork in the path - optimum branch highlighted.
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none" strokeLinecap="square">
          <path d="M28 46 L28 30 L14 16" stroke={muted} />
          <path d="M28 30 L42 16" />
          <circle cx="28" cy="30" r="2.4" fill={accent} stroke="none" />
          <circle cx="42" cy="16" r="2" fill={accent} stroke="none" />
          <circle cx="14" cy="16" r="2" fill={muted} stroke="none" />
          <circle cx="28" cy="46" r="2" fill={muted} stroke="none" />
        </g>
      );
    case "Executor":
      // Single decisive strike through a horizontal field.
      return (
        <g stroke={accent} strokeWidth="1.6" fill="none">
          <line x1="8" y1="28" x2="48" y2="28" stroke={muted} />
          <line x1="8" y1="34" x2="48" y2="34" stroke={muted} />
          <line x1="8" y1="40" x2="48" y2="40" stroke={muted} />
          <line x1="8" y1="22" x2="48" y2="22" stroke={muted} />
          <line x1="14" y1="14" x2="42" y2="46" strokeWidth="2.4" />
          <circle cx="42" cy="46" r="2.4" fill={accent} stroke="none" />
        </g>
      );
    default:
      return null;
  }
}
