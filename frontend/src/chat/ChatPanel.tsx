// The chat panel (brief §6): header, the scrolling message list and the input pinned
// to the bottom. Only the list scrolls, so the input never leaves the screen.

import { hasPending, useStore } from "../store.ts";
import { send } from "../ws.ts";
import { ChatInput } from "./ChatInput.tsx";
import { MessageList } from "./MessageList.tsx";

export function ChatPanel({ projectName, className = "" }: { projectName: string; className?: string }) {
  const disconnected = useStore((state) => state.connection !== "open");
  // Same rule as the backend's newChat(): only from a resting state (idle or error), so
  // nothing in flight is lost. Disabled rather than hidden, so the header never shifts.
  const canStartOver = useStore(
    (state) =>
      state.agents.every((agent) => agent.state === "idle" || agent.state === "error") &&
      state.queued.length === 0 &&
      !hasPending(state.timeline),
  );

  return (
    <section aria-label="Chat" className={`flex flex-col overflow-hidden rounded-panel bg-surface ${className}`}>
      <header className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-title font-semibold">Chat</h2>
        <div className="flex items-baseline gap-4">
          {/* No confirm step: the old chat is archived, not deleted. */}
          <button
            type="button"
            onClick={() => send({ type: "new_chat" })}
            disabled={disconnected || !canStartOver}
            className="rounded-row text-label font-semibold text-text disabled:text-text-faint"
          >
            New chat
          </button>
          <span className="text-label text-text-muted">Manager</span>
        </div>
      </header>
      {disconnected && (
        <p role="status" className="border-b border-line bg-surface-sunken px-5 py-1.5 text-meta text-text-muted">
          Reconnecting…
        </p>
      )}
      <MessageList projectName={projectName} />
      <ChatInput disconnected={disconnected} />
    </section>
  );
}
