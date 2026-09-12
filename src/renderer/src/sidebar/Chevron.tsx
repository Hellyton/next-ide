/** Expand/collapse arrow for the sidebar rows: brighter and bigger than the old ▸/▾ glyphs. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-100 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M6 3.2 10.8 8 6 12.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
