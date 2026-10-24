// App state. ws.ts and api.ts write it; components only read it.

import type { Agent, PermissionResolvedEvent, ProjectStatus, ServerEvent } from "@agent-office/shared";
import { create } from "zustand";

// "closed" also covers the retries after a drop, so the UI doesn't flicker between them.
export type Connection = "connecting" | "open" | "closed";

export interface QueuedMessage {
  id: string;
  text: string;
}

// One row of the chat timeline: the server's chat events, folded into what the UI shows
// (deltas merged into one text, a permission request carrying its outcome).
export type ChatItem =
  | { kind: "user"; id: string; text: string; status: "delivered" | "cancelled" }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "tool"; id: string; tool: string; label: string; outsideProject?: true }
  | {
      kind: "permission";
      id: string;
      toolUseId: string;
      tool: string;
      label: string;
      detail: string;
      outsideProject?: true;
      // Absent while pending.
      decision?: PermissionResolvedEvent["decision"];
    }
  | { kind: "error"; id: string; message: string }
  | { kind: "stopped"; id: string };

// Everything the server's events decide.
export interface ServerState {
  // The project slice: from every snapshot, and from a successful POST /api/project.
  // null until the first snapshot arrives.
  project: ProjectStatus | null;
  agents: Agent[];
  // What has happened, in order.
  timeline: ChatItem[];
  // Messages waiting for the current turn to end, oldest first. Kept apart from the
  // timeline, like the backend does, so they always render after it.
  queued: QueuedMessage[];
}

interface State extends ServerState {
  connection: Connection;
}

const empty: ServerState = { project: null, agents: [], timeline: [], queued: [] };

export const useStore = create<State>()(() => ({ connection: "connecting", ...empty }));

export function isBusy(agents: Agent[]): boolean {
  return agents.some((agent) => agent.state === "thinking" || agent.state === "working" || agent.state === "waiting");
}

// The next state after one server event. Pure: no mutation, no I/O, and the same object
// back when the event changes nothing, so it can be reasoned about (and tested) one event
// at a time. A snapshot replays its chat through this same function, so a reload can't
// end up different from what the live events built.
export function applyEvent<S extends ServerState>(state: S, event: ServerEvent): S {
  switch (event.type) {
    case "snapshot": {
      const start: S = { ...state, ...empty, project: event.project, agents: event.agents };
      return event.chat.reduce<S>(applyEvent, start);
    }

    case "agent_state": {
      const agents = state.agents.some((agent) => agent.id === event.agent.id)
        ? state.agents.map((agent) => (agent.id === event.agent.id ? event.agent : agent))
        : [...state.agents, event.agent];
      return { ...state, agents };
    }

    case "user_message": {
      if (event.status === "queued") {
        return { ...state, queued: [...state.queued, { id: event.id, text: event.text }] };
      }
      return append(state, { kind: "user", id: event.id, text: event.text, status: event.status });
    }

    // Leaves the queued tail and lands at the end of the timeline, after whatever is
    // there now, as in the backend's log.
    case "message_status": {
      const message = state.queued.find((queued) => queued.id === event.id);
      if (!message) return state;
      const queued = state.queued.filter((queued) => queued !== message);
      return append({ ...state, queued }, { kind: "user", id: message.id, text: message.text, status: event.status });
    }

    // Appended to the item with the same id: deltas arrive one by one, but the snapshot
    // merges them, so the item may already hold earlier text.
    case "assistant_text": {
      const index = state.timeline.findLastIndex((item) => item.kind === "assistant" && item.id === event.id);
      if (index === -1) return append(state, { kind: "assistant", id: event.id, text: event.delta });
      const timeline = state.timeline.slice();
      const item = timeline[index] as Extract<ChatItem, { kind: "assistant" }>;
      timeline[index] = { ...item, text: item.text + event.delta };
      return { ...state, timeline };
    }

    case "tool_use": {
      const { type: _, ...rest } = event;
      return append(state, { kind: "tool", ...rest });
    }

    case "permission_request": {
      const { type: _, ...rest } = event;
      return append(state, { kind: "permission", ...rest });
    }

    case "permission_resolved": {
      const index = state.timeline.findIndex((item) => item.kind === "permission" && item.id === event.id);
      if (index === -1) return state;
      const timeline = state.timeline.slice();
      timeline[index] = { ...(timeline[index] as Extract<ChatItem, { kind: "permission" }>), decision: event.decision };
      return { ...state, timeline };
    }

    case "error":
      return append(state, { kind: "error", id: event.id, message: event.message });

    case "stopped":
      return append(state, { kind: "stopped", id: event.id });
  }
}

function append<S extends ServerState>(state: S, item: ChatItem): S {
  return { ...state, timeline: [...state.timeline, item] };
}
