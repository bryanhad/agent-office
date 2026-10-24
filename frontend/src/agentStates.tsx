// The state system (brief §3): one definition of what each agent state looks like, shared
// by the office, the compact strip and, later, the 3D renderer's overlays. That's why it
// lives here and not in office/. Colors are not in this table: each state's body / strong /
// soft tokens are picked in CSS from a `data-state` attribute, so the tokens stay in one
// place (index.css). Eyes and motion are CSS too (office/blob.css).

import type { Agent, AgentState } from "@agent-office/shared";
import type { ComponentType } from "react";
import { AlertGlyph, CrossGlyph, IdleGlyph, ThinkingGlyph, WrenchGlyph } from "./glyphs.tsx";

interface StateLook {
  Glyph: ComponentType<{ className?: string }>;
  // The plain line under the name. Only idle's is playful.
  label: (agent: Agent) => string;
}

export const STATE_LOOK: Record<AgentState, StateLook> = {
  idle: { Glyph: IdleGlyph, label: () => "Ready when you are" },
  thinking: { Glyph: ThinkingGlyph, label: () => "Thinking" },
  // The backend sends the activity lowercase ("editing App.tsx"); as a label it's a sentence.
  working: { Glyph: WrenchGlyph, label: (agent) => (agent.activity ? capitalize(agent.activity) : "Working") },
  waiting: { Glyph: AlertGlyph, label: () => "Waiting for your approval" },
  error: { Glyph: CrossGlyph, label: () => "Something went wrong" },
};

export function stateLabel(agent: Agent): string {
  return STATE_LOOK[agent.state].label(agent);
}

// For the office's aria-live region: "Manager: waiting for your approval".
export function announcement(agent: Agent): string {
  const label = stateLabel(agent);
  return `${agent.role}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
