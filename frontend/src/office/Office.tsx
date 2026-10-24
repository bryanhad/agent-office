// The office (brief §4, §5): a wall band with the project plaque, and the Manager at one
// desk on the floor. Nothing else in the room. Shown from 760px; below that, OfficeStrip.
//
// The swappable renderer (decision 004): it reads only `project` and `agents` from the
// store, and holds no event logic. The 3D office will replace this file and Blob.tsx.

import { announcement, stateLabel } from "../agentStates.tsx";
import { useStore } from "../store.ts";
import { Blob } from "./Blob.tsx";

export function Office() {
  const projectName = useStore((state) => state.project?.project?.name ?? "");
  const manager = useStore((state) => state.agents.find((agent) => agent.id === "manager"));

  return (
    <section
      aria-label="Office"
      data-state={manager?.state}
      className="hidden min-w-[320px] flex-1 flex-col overflow-hidden rounded-panel bg-office-ground min-[760px]:flex"
    >
      <div className="flex justify-center bg-office-wall px-6 py-8">
        <div className="flex min-w-0 max-w-full flex-col items-center rounded-card border border-line bg-surface px-8 py-3">
          <span className="text-meta uppercase tracking-wider text-text-muted">Project</span>
          <span className="max-w-full truncate font-mono text-plaque" title={projectName}>
            {projectName}
          </span>
        </div>
      </div>

      {/* --blob-size: ~110px in the half-screen fallback, ~150px at full width. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 [--blob-size:110px] min-[1200px]:[--blob-size:150px]">
        {manager && (
          <>
            <Blob agent={manager} />
            <Desk />
            <p className="mt-[calc(var(--blob-size)*0.35+20px)] text-title font-semibold">{manager.role}</p>
            <p
              className="max-w-full truncate text-label text-(color:--state-strong) min-[1200px]:text-body"
              title={stateLabel(manager)}
            >
              {stateLabel(manager)}
            </p>
            <p aria-live="polite" className="sr-only">
              {announcement(manager)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// A plain bar on two legs, a little wider than the blob.
function Desk() {
  return (
    <div aria-hidden="true" className="relative mt-3 h-3 w-[calc(var(--blob-size)*2)] rounded-[3px] bg-desk">
      <span className="absolute top-full left-[10%] h-[calc(var(--blob-size)*0.35)] w-2 bg-desk" />
      <span className="absolute top-full right-[10%] h-[calc(var(--blob-size)*0.35)] w-2 bg-desk" />
    </div>
  );
}
