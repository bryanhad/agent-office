// State glyphs (brief §3): SVG on one 16px grid with one stroke weight, drawn in
// currentColor so the parent sets the tone. Only × so far; the rest come with the office.

const STROKE = 1.75;

export function CrossGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </svg>
  );
}
