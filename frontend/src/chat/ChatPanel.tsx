// The chat panel (brief §6): header, the scrolling message list and the input pinned
// to the bottom. Only the list scrolls, so the input never leaves the screen.

import { useStore } from "../store.ts";
import { ChatInput } from "./ChatInput.tsx";
import { MessageList } from "./MessageList.tsx";

export function ChatPanel({ projectName, className = "" }: { projectName: string; className?: string }) {
  const disconnected = useStore((state) => state.connection !== "open");

  return (
    <section aria-label="Chat" className={`flex flex-col overflow-hidden rounded-panel bg-surface ${className}`}>
      <header className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-title font-semibold">Chat</h2>
        <span className="text-label text-text-muted">Manager</span>
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
