// The chat log and the agents. Every change goes through here and on to the listeners,
// so ws.ts can broadcast it and session.ts can save it (saved.ts) without either knowing
// about the other.

import { randomUUID } from "node:crypto";
import type { Agent, AgentState, ChatEvent, MessageStatusEvent, ServerEvent, UserMessageEvent } from "@agent-office/shared";

const MANAGER = { id: "manager", role: "Manager" } as const;

let chat: ChatEvent[] = [];
// Queued user messages, oldest first. Kept apart from `chat` so the current turn's text
// keeps merging into one item per block; the snapshot puts them after it.
let queued: UserMessageEvent[] = [];
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
  if (event.type === "user_message" && event.status === "queued") {
    queued.push(event);
  } else if (event.type === "assistant_text" && last?.type === "assistant_text" && last.id === event.id) {
    chat[chat.length - 1] = { ...last, delta: last.delta + event.delta };
  } else {
    chat.push(event);
  }
  publish(event);
}

// A queued message was delivered or cancelled: it moves from the queue to the end of the
// timeline with its new status. Returns it, or undefined if it wasn't queued.
export function setMessageStatus(id: string, status: MessageStatusEvent["status"]): UserMessageEvent | undefined {
  const index = queued.findIndex((message) => message.id === id);
  if (index === -1) return undefined;
  const [message] = queued.splice(index, 1);
  const updated = { ...message, status };
  chat.push(updated);
  publish({ type: "message_status", id, status });
  return updated;
}

export function queuedMessages(): readonly UserMessageEvent[] {
  return queued;
}

export function agentState(): AgentState {
  return manager.state;
}

// Publishes only real changes, so repeated "thinking" signals don't spam the socket.
export function setAgentState(state: AgentState, activity?: string): void {
  if (manager.state === state && manager.activity === activity) return;
  manager = activity === undefined ? { ...MANAGER, state } : { ...MANAGER, state, activity };
  publish({ type: "agent_state", agent: manager });
}

export function chatLog(): ChatEvent[] {
  return [...chat, ...queued];
}

export function agents(): Agent[] {
  return [manager];
}

// A new project starts a new conversation. Publishes nothing: the caller sends a snapshot.
export function resetChat(): void {
  chat = [];
  queued = [];
  manager = { ...MANAGER, state: "idle" };
}

// Load a saved log after a restart. Nothing in it may reach the agent unseen: queued
// messages come back cancelled, and a request that was still pending comes back resolved
// "cancelled" (its canUseTool call died with the old process). A notice says why.
// Publishes nothing: the caller sends a snapshot.
export function restoreChat(log: ChatEvent[]): void {
  const resolved = new Set(log.filter((event) => event.type === "permission_resolved").map((event) => event.id));
  const requests = log.filter((event) => event.type === "permission_request" && !resolved.has(event.id));
  let messages = 0;
  chat = log.map((event) => {
    if (event.type !== "user_message" || event.status !== "queued") return event;
    messages++;
    return { ...event, status: "cancelled" };
  });
  for (const request of requests) chat.push({ type: "permission_resolved", id: request.id, decision: "cancelled" });

  const cancelled: string[] = [];
  if (requests.length > 0) cancelled.push(requests.length === 1 ? "the pending request" : "the pending requests");
  if (messages > 0) cancelled.push(messages === 1 ? "the queued message" : "the queued messages");
  if (cancelled.length === 0) return;
  const verb = requests.length + messages === 1 ? "was" : "were";
  chat.push({ type: "notice", id: randomUUID(), text: `The backend restarted, so ${cancelled.join(" and ")} ${verb} cancelled.` });
}
