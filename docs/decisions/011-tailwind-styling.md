# 011: Tailwind CSS for styling

**Decision:** The frontend is styled with Tailwind CSS v4, set up through its Vite plugin (`@tailwindcss/vite`). The tokens from [the MVP design brief](../design/mvp-brief.md) (neutral roles, the five state colors with `body` / `strong` / `soft` tones, the type scale, the 4px spacing, radii, the focus ring) live in the `@theme` block of `frontend/src/index.css`. Blob animations are plain CSS `@keyframes` in the same file, each with a `prefers-reduced-motion` version as the brief describes.

**Why:**
- Utility classes keep components small and readable, with no separate stylesheet per component to keep in sync.
- One file holds every token. Tailwind's default colors, font sizes, weights and shadows are cleared in `@theme`, so only the brief's roles exist as classes. "Color only reports state" is then enforced by the build: there is no `bg-blue-500` to reach for.
- Theme values are plain CSS variables (`var(--color-waiting-body)`), so hand-written CSS, a later dark theme and the 3D renderer's overlays can use the same values.
- Keyframes stay plain CSS because animations with reduced-motion variants are clearer as CSS than as long arbitrary-value classes.

**Alternatives considered:**
- Plain CSS or CSS modules: no extra dependency, but tokens and layout rules spread over many files, and nothing stops off-palette colors.
- CSS-in-JS: runtime cost and more machinery than this app needs.

Setup checked against tailwindcss.com/docs/installation/using-vite and /docs/theme (v4.3).
