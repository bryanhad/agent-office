// Pick the project folder (brief §4, Start screen). Plain register throughout.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { openProject } from "./api.ts";
import { BlobFace } from "./BlobFace.tsx";
import { CrossGlyph } from "./glyphs.tsx";

interface Props {
  // PROJECT_DIR is set but invalid; the reason comes from the backend.
  configError?: string;
  unreachable: boolean;
}

export function StartScreen({ configError, unreachable }: Props) {
  const [path, setPath] = useState("~/");
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Focus with the caret after the prefilled "~/", so typing continues the path.
  function focusInput() {
    const element = input.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }

  useEffect(focusInput, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (opening) return;
    setOpening(true);
    setError(null);
    const result = await openProject(path);
    // On success the store switches to the main view and this screen unmounts.
    if (!result.ok) {
      setOpening(false);
      setError(result.error);
      // After the re-render that re-enables the input.
      requestAnimationFrame(focusInput);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
      <div className="flex w-full max-w-[560px] flex-col items-center rounded-card border border-line bg-surface px-6 py-10 sm:px-12">
        <BlobFace />
        <h1 className="mt-4 text-display font-semibold">Agent Office</h1>
        <p className="mt-1 text-text-muted">Which project should the agents work in?</p>

        {configError && (
          <p className="mt-6 flex w-full items-start gap-2 rounded-row bg-error-soft px-3 py-2 text-label text-error-strong">
            <CrossGlyph className="mt-px" />
            <span>The project folder set in the backend config isn't valid: {configError}</span>
          </p>
        )}

        <form onSubmit={submit} className="mt-6 w-full">
          <div className="flex gap-3">
            <input
              ref={input}
              type="text"
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setError(null);
              }}
              aria-label="Project folder"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "path-error" : undefined}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-card border border-line bg-surface px-4 py-2.5 font-mono text-body"
            />
            <button
              type="submit"
              disabled={opening}
              className="rounded-card bg-text px-6 py-2.5 font-semibold text-white disabled:opacity-60"
            >
              {opening ? "Opening…" : "Open"}
            </button>
          </div>
          {error && (
            <p id="path-error" className="mt-2 flex items-start gap-1.5 text-label text-error-strong">
              <CrossGlyph className="mt-px" />
              <span>{error}</span>
            </p>
          )}
        </form>

        <p className="mt-6 w-full text-meta text-text-muted">Tip: you can type ~ for your home folder</p>
      </div>

      <p aria-live="polite" className="text-label text-text-muted">
        {unreachable ? "Can't reach the backend. Is it running? Retrying…" : ""}
      </p>
    </main>
  );
}
