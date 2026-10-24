// The blob (brief §3): a round body with two eyes and the state's glyph in a bubble
// above-right. A pure view of one agent: the look per state is blob.css plus the shared
// table in agentStates.tsx. Its size comes from the parent's `--blob-size`.

import type { Agent, AgentState } from "@agent-office/shared";
import type { ReactNode } from "react";
import { STATE_LOOK } from "../agentStates.tsx";
import "./blob.css";

interface BodyProps {
  state: AgentState;
  className?: string;
  // Compact (the narrow strip): waiting keeps a steady ring, without the pulse.
  compact?: boolean;
  children?: ReactNode;
}

// The body and eyes alone. Also the app's mark on the start screen.
export function BlobBody({ state, className = "", compact, children }: BodyProps) {
  return (
    <div aria-hidden="true" data-state={state} data-compact={compact || undefined} className={`blob ${className}`}>
      <div className="blob-body">
        <div className="blob-eyes">
          <span className="blob-eye" />
          <span className="blob-eye" />
        </div>
      </div>
      {children}
    </div>
  );
}

export function Blob({ agent, compact }: { agent: Agent; compact?: boolean }) {
  const { Glyph } = STATE_LOOK[agent.state];
  return (
    <BlobBody state={agent.state} compact={compact}>
      <div className="blob-bubble">
        <Glyph />
      </div>
    </BlobBody>
  );
}
