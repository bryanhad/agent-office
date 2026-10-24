// State glyphs (brief §3): SVG on one 16px grid with one stroke weight, drawn in
// currentColor so the parent sets the tone. The five state glyphs (z, dots, wrench, !, ×)
// are the bubble's set; ■ and the warning triangle are controls and signals, not states.

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

// Idle: a "z".
export function IdleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M5 5h6l-6 6h6"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Thinking: three dots, separate circles so the blob's CSS can step them in turn.
export function ThinkingGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <circle className="glyph-dot" cx="3.5" cy="8" r="1.4" fill="currentColor" />
      <circle className="glyph-dot" cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle className="glyph-dot" cx="12.5" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

// Working: a wrench. Drawn on a 24 grid and scaled down, with the stroke scaled up to
// match, so it renders at the same 16px size and line weight as the others.
export function WrenchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.3-3.3a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"
        stroke="currentColor"
        strokeWidth={STROKE * 1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// Waiting: a "!".
export function AlertGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M8 3.5v6" stroke="currentColor" strokeWidth={STROKE + 0.25} strokeLinecap="round" fill="none" />
      <circle cx="8" cy="12.5" r="1.1" fill="currentColor" />
    </svg>
  );
}
