// The permission card (brief §6), the most important control in the app. Pending: the
// tool, its label, the full path or command (every line, never cut), the outside-project
// warning, and Approve / Deny. Resolved: it collapses into a tool line with the outcome.
//
// Never auto-focused, so an Enter meant for the chat input can't approve; both buttons
// are reachable by Tab.

import { useState } from "react";
import { useStore, type ChatItem } from "../store.ts";
import { send } from "../ws.ts";
import { OutsideProject, ToolLine } from "./ToolLine.tsx";

type Permission = Extract<ChatItem, { kind: "permission" }>;

const DECISION_LABEL = { approved: "Approved", denied: "Denied", timed_out: "Timed out", cancelled: "Cancelled" };

const TITLE: Record<string, string> = {
  Edit: "Edit a file",
  Write: "Write a file",
  Bash: "Run a command",
  Read: "Read a file",
  Glob: "Search files",
  Grep: "Search files",
};

export function PermissionCard({ item }: { item: Permission }) {
  const disconnected = useStore((state) => state.connection !== "open");
  // Set on click until the resolved event arrives, so a double click can't answer twice.
  const [answered, setAnswered] = useState(false);

  if (item.decision) {
    return (
      <ToolLine
        tool={item.tool}
        target={item.detail}
        outcome={DECISION_LABEL[item.decision]}
        outsideProject={item.outsideProject}
      />
    );
  }

  function answer(decision: "approve" | "deny") {
    setAnswered(true);
    send({ type: "permission_response", id: item.id, decision });
  }

  const titleId = `permission-${item.id}`;
  const disabled = disconnected || answered;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card border-[1.5px] border-waiting-body bg-waiting-soft p-4 shadow-waiting-ring"
    >
      <div className="flex flex-col">
        <h3 id={titleId} className="text-title font-semibold">
          {TITLE[item.tool] ?? `Use ${item.tool}`}
        </h3>
        {item.label && item.label !== item.detail && (
          <p className="break-words text-label text-text-muted">{item.label}</p>
        )}
      </div>
      {/* About 12 lines of 13px text, then it scrolls inside with a visible scrollbar. */}
      <pre
        tabIndex={0}
        className="scroll-visible max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words rounded-row border border-line bg-surface px-3 py-2 font-mono text-label"
      >
        {item.detail}
      </pre>
      {item.outsideProject && <OutsideProject path={item.detail} />}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => answer("deny")}
          disabled={disabled}
          className="rounded-card border border-text bg-surface px-4 py-2 font-semibold disabled:opacity-60"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => answer("approve")}
          disabled={disabled}
          className="rounded-card bg-text px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          Approve
        </button>
      </div>
    </section>
  );
}
