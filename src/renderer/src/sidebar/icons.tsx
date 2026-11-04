type IconProps = { className?: string }

/** Pixel-art Claude Code mascot, in the brand orange. */
export function ClaudeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 11" aria-hidden className={className} shapeRendering="crispEdges">
      <g fill="#E8925F">
        <rect x="2" y="0" width="12" height="8" />
        <rect x="0" y="4" width="16" height="2" />
        <rect x="3" y="8" width="1" height="3" />
        <rect x="5" y="8" width="1" height="3" />
        <rect x="10" y="8" width="1" height="3" />
        <rect x="12" y="8" width="1" height="3" />
      </g>
      <g fill="#111">
        <rect x="4" y="2" width="1" height="2" />
        <rect x="11" y="2" width="1" height="2" />
      </g>
    </svg>
  )
}

/** Terminal window with a `>_` prompt. */
export function TerminalIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="m7 10 3 2.5L7 15" />
      <path d="M12.5 15H17" />
    </svg>
  )
}
