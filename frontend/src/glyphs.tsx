// State glyphs (brief §3): SVG on one 16px grid with one stroke weight, drawn in
// currentColor so the parent sets the tone. ×, ■ and the warning triangle so far; the
// rest come with the office.

const STROKE = 1.75;

export function CrossGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Stop control and the Stopped line: a small filled square.
export function StopGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

// The "outside the project" warning: a triangle with "!". Not a state glyph, so it is
// drawn in the text color, never a state color.
export function WarningGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M8 2.5l6 10.5H2z M8 6.5v3"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="8" cy="11.25" r="0.9" fill="currentColor" />
    </svg>
  );
}
