// The main screen (brief §4, §5): office | chat side by side from 760px, with the chat
// at 420px up to 1200px and 480px above; below 760px the office shrinks to a strip
// above the chat. The office parts are placeholders until step 13 builds the room and
// the blob; like that renderer, they read only `project` and `agents`.

import { ChatPanel } from "./chat/ChatPanel.tsx";
import { useStore } from "./store.ts";

export function MainScreen({ projectName }: { projectName: string }) {
  return (
    <div className="flex h-dvh flex-col gap-3 p-4 min-[760px]:flex-row min-[760px]:gap-4">
      <OfficePlaceholder projectName={projectName} />
      <StripPlaceholder projectName={projectName} />
      <ChatPanel
        projectName={projectName}
        className="min-h-0 flex-1 min-[760px]:w-[420px] min-[760px]:flex-none min-[1200px]:w-[480px]"
      />
    </div>
  );
}

function ManagerStatus() {
  const manager = useStore((state) => state.agents.find((agent) => agent.id === "manager"));
  if (!manager) return null;
  return (
    <span className="text-label text-text-muted">
      {manager.state}
      {manager.activity && ` · ${manager.activity}`}
    </span>
  );
}

function OfficePlaceholder({ projectName }: { projectName: string }) {
  return (
    <section
      aria-label="Office"
      className="hidden min-w-[320px] flex-1 flex-col items-center justify-center gap-2 rounded-panel bg-office-ground min-[760px]:flex"
    >
      <p className="max-w-full truncate px-6 font-mono text-plaque" title={projectName}>
        {projectName}
      </p>
      <p className="text-title font-semibold">Manager</p>
      <ManagerStatus />
    </section>
  );
}

function StripPlaceholder({ projectName }: { projectName: string }) {
  return (
    <section
      aria-label="Office"
      className="flex h-[72px] shrink-0 items-center gap-3 rounded-panel bg-office-ground px-4 min-[760px]:hidden"
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-label font-semibold">Manager</span>
        <ManagerStatus />
      </div>
      <span className="ml-auto truncate font-mono text-label text-text-muted" title={projectName}>
        {projectName}
      </span>
    </section>
  );
}
