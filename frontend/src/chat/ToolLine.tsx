// A tool line (brief §6): one sunken row with the plain tool name, a separator and the
// target, and the outcome at the right edge when the call needed my approval. A path
// outside the project gets its own warning line under the row.

import { WarningGlyph } from "../glyphs.tsx";

export function ToolLine({
  tool,
  target,
  outcome,
  outsideProject,
}: {
  tool: string;
  target: string;
  outcome?: string;
  outsideProject?: true;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2 rounded-row bg-surface-sunken px-3 py-2 text-label">
        <span className="shrink-0">{tool}</span>
        {/* A real character, not just a gap, so "Bash · ls" also reads apart when copied
            or read aloud. */}
        <span className="shrink-0 text-text-faint">·</span>
        <span className="min-w-0 truncate font-mono text-text-muted" title={target}>
          {target}
        </span>
        {outcome && <span className="ml-auto shrink-0 pl-2 text-meta text-text-muted">{outcome}</span>}
      </div>
      {outsideProject && <OutsideProject path={target} />}
    </div>
  );
}

// A safety signal, so it carries an icon and explicit words, not weight or color alone,
// and it never uses a state color: it isn't an agent state.
export function OutsideProject({ path }: { path: string }) {
  return (
    <p className="flex min-w-0 items-start gap-1.5 px-3 text-label font-semibold">
      <WarningGlyph className="mt-px" />
      <span className="min-w-0 break-words">
        Outside the project: <span className="font-mono">{path}</span>
      </span>
    </p>
  );
}
