// The chat log and the agents, in memory only (no history across restarts in the MVP).
// Every change goes through here and on to the listeners, so ws.ts can broadcast it and
// build the snapshot without the session knowing about sockets.

import type { Agent, AgentState, ChatEvent, ServerEvent } from "@agent-office/shared";

const MANAGER = { id: "manager", role: "Manager" } as const;

let chat: ChatEvent[] = [];
let manager: Agent = { ...MANAGER, state: "idle" };
const listeners = new Set<(event: ServerEvent) => void>();

export function onServerEvent(listener: (event: ServerEvent) => void): void {
  listeners.add(listener);
}

function publish(event: ServerEvent): void {
  for (const listener of listeners) listener(event);
}

// Listeners get each delta as it comes; the log keeps one item per text block,
// so a reload replays whole paragraphs instead of hundreds of fragments.
export function addChat(event: ChatEvent): void {
  const last = chat.at(-1);
  if (event.type === "assistant_text" && last?.type === "assistant_text" && last.id === event.id) {
    chat[chat.length - 1] = { ...last, delta: last.delta + event.delta };
  } else {
    chat.push(event);
  }
  publish(event);
}

// Publishes only real changes, so repeated "thinking" signals don't spam the socket.
export function setAgentState(state: AgentState, activity?: string): void {
  if (manager.state === state && manager.activity === activity) return;
  manager = activity === undefined ? { ...MANAGER, state } : { ...MANAGER, state, activity };
  publish({ type: "agent_state", agent: manager });
}

export function chatLog(): ChatEvent[] {
  return chat;
}

export function agents(): Agent[] {
  return [manager];
}

// Request ids with no `permission_resolved` yet: the cards a reload would show again.
export function unresolvedRequests(): string[] {
  const resolved = new Set(chat.flatMap((e) => (e.type === "permission_resolved" ? [e.id] : [])));
  return chat.flatMap((e) => (e.type === "permission_request" && !resolved.has(e.id) ? [e.id] : []));
}

// A new project starts a new conversation. Publishes nothing: the caller sends a snapshot.
export function resetChat(): void {
  chat = [];
  manager = { ...MANAGER, state: "idle" };
}
