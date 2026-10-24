// The office below 760px (brief §5): a compact strip above the chat with a mini blob, its
// name and state label, and the project name. The office at small scale, not a second
// state system: same blob, glyphs and labels. In waiting the strip turns amber-soft and
// the blob keeps a steady ring, so it reads from the corner of the eye.
//
// Like Office, it reads only `project` and `agents`. It can stay 2D when the office goes 3D.

import { announcement, stateLabel } from "../agentStates.tsx";
import { useStore } from "../store.ts";
import { Blob } from "./Blob.tsx";

export function OfficeStrip() {
  const projectName = useStore((state) => state.project?.project?.name ?? "");
  const manager = useStore((state) => state.agents.find((agent) => agent.id === "manager"));

  return (
    <section
      aria-label="Office"
      data-state={manager?.state}
      className="flex h-[72px] shrink-0 items-center gap-3 rounded-panel bg-office-ground pr-4 pl-5 data-[state=waiting]:bg-waiting-soft min-[760px]:hidden"
    >
      {manager && (
        <>
          {/* Nudged down so the bubble above-right stays inside the strip. */}
          <div className="mt-3 [--blob-size:40px]">
            <Blob agent={manager} compact />
          </div>
          <div className="ml-3 flex min-w-0 flex-col">
            <span className="text-label font-semibold">{manager.role}</span>
            <span className="truncate text-label text-(color:--state-strong)" title={stateLabel(manager)}>
              {stateLabel(manager)}
            </span>
          </div>
          <p aria-live="polite" className="sr-only">
            {announcement(manager)}
          </p>
        </>
      )}
      <span className="ml-auto max-w-[40%] shrink-0 truncate font-mono text-label text-text-muted" title={projectName}>
        {projectName}
      </span>
    </section>
  );
}
