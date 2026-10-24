// The chat timeline, then the queued messages (brief §6). While a permission card is
// pending, everything else in the timeline steps back so the decision takes the stage;
// queued messages and the input stay as they are.

import { useLayoutEffect, useRef, useState } from "react";
import { CrossGlyph, StopGlyph } from "../glyphs.tsx";
import { hasPending, useStore, type ChatItem } from "../store.ts";
import { send } from "../ws.ts";
import { Markdown } from "./Markdown.tsx";
import { PermissionCard } from "./PermissionCard.tsx";
import { ThinkingIndicator } from "./ThinkingIndicator.tsx";
import { ToolLine } from "./ToolLine.tsx";

// How close to the bottom still counts as "at the bottom", for sub-pixel scroll positions
// and a last line that's only partly in view.
const BOTTOM_SLACK_PX = 32;

const FADE = "transition-[opacity,color] duration-150 motion-reduce:transition-none";

// How an item steps back while a card is pending: text goes faint, rows go translucent.
function stepBack(item: ChatItem): string {
  if (item.kind === "permission" && !item.decision) return "";
  // A cancelled bubble sets its own muted color, hence the override on its children.
  if (item.kind === "user") return "text-text-faint [&_*]:text-text-faint";
  return item.kind === "assistant" ? "text-text-faint" : "opacity-60";
}

export function MessageList({ projectName }: { projectName: string }) {
  const timeline = useStore((state) => state.timeline);
  const queued = useStore((state) => state.queued);
  // The thinking indicator at the bottom appears and changes with the agent's state.
  const agents = useStore((state) => state.agents);
  const pending = useStore((state) => hasPending(state.timeline));
  const list = useRef<HTMLDivElement>(null);
  // A ref, not state: it's read during layout, before the scroll handler would re-render.
  const atBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);

  function scrollToBottom() {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }

  function onScroll() {
    const element = list.current!;
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_SLACK_PX;
    if (atBottom.current) setNewBelow(false);
  }

  // Follow new content only if I was at the bottom; otherwise offer the pill instead of
  // pulling me down. Before paint, so a streamed line never flashes below the fold.
  useLayoutEffect(() => {
    if (atBottom.current) scrollToBottom();
    else setNewBelow(true);
  }, [timeline, queued, agents]);

  // The list also shrinks when the input grows; stay pinned to the bottom through that.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => atBottom.current && scrollToBottom());
    observer.observe(list.current!);
    return () => observer.disconnect();
  }, []);

  const empty = timeline.length === 0 && queued.length === 0;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={list} onScroll={onScroll} className="flex h-full flex-col gap-3 overflow-y-auto px-5 py-4">
        {empty && (
          <p className="m-auto text-center text-text-muted">Ask the manager anything about {projectName}.</p>
        )}
        {/* One flat keyed list, so a delivered message keeps its DOM node as it moves from
            the queued tail into the timeline, and its dimming fades out instead of jumping. */}
        {timeline.map((item) => (
          <div key={`${item.kind}-${item.id}`} className={`${FADE} ${pending ? stepBack(item) : ""}`}>
            <Item item={item} />
          </div>
        ))}
        {queued.map((message) => (
          <div key={`user-${message.id}`} className={FADE}>
            <UserMessage id={message.id} text={message.text} status="queued" />
          </div>
        ))}
        <ThinkingIndicator />
      </div>
      {newBelow && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-surface px-3 py-1 text-meta"
        >
          Jump to latest
        </button>
      )}
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return <UserMessage id={item.id} text={item.text} status={item.status} />;
    case "assistant":
      return <Markdown text={item.text} />;
    case "tool":
      return <ToolLine tool={item.tool} target={item.label} outsideProject={item.outsideProject} />;
    case "permission":
      return <PermissionCard item={item} />;
    case "error":
      return (
        <p className="flex items-start gap-2 rounded-row bg-error-soft px-3 py-2 text-label text-error-strong">
          <CrossGlyph className="mt-px" />
          <span className="whitespace-pre-wrap break-words">{item.message}</span>
        </p>
      );
    case "stopped":
      return (
        <p className="flex items-center gap-1.5 px-3 text-label text-text-muted">
          <StopGlyph />
          Stopped
        </p>
      );
  }
}

function UserMessage({ id, text, status }: { id: string; text: string; status: "queued" | "delivered" | "cancelled" }) {
  const look = {
    queued: "border-dashed border-line opacity-55",
    delivered: "border-transparent bg-surface-sunken",
    cancelled: "border-transparent bg-surface-sunken text-text-muted",
  }[status];

  return (
    <div className="flex flex-col items-end gap-1">
      <p
        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-card border px-4 py-2.5 transition-[opacity,background-color] duration-150 motion-reduce:transition-none ${look}`}
      >
        {text}
      </p>
      {status === "queued" && (
        <p className="flex items-center gap-3 text-meta text-text-muted">
          Queued
          <button
            type="button"
            onClick={() => send({ type: "cancel_message", id })}
            className="rounded-row font-semibold text-text"
          >
            Cancel
          </button>
        </p>
      )}
      {status === "cancelled" && <p className="text-meta text-text-muted">Cancelled</p>}
    </div>
  );
}
