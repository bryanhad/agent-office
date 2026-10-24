// The WebSocket to the backend, through the Vite proxy at /ws on this page's own host.
// Every server event goes through applyEvent; a reconnect gets a fresh snapshot, which
// replaces the whole state, so nothing missed during a drop lingers.

import type { ClientEvent, ServerEvent } from "@agent-office/shared";
import { applyEvent, useStore } from "./store.ts";

const RETRY_MS = 2000;

let socket: WebSocket | null = null;

export function connect(): void {
  const current = new WebSocket(`ws://${location.host}/ws`);
  socket = current;
  current.addEventListener("open", () => useStore.setState({ connection: "open" }));
  // A failed attempt fires "close" too, so this one handler also drives the retries.
  current.addEventListener("close", () => {
    useStore.setState({ connection: "closed" });
    setTimeout(connect, RETRY_MS);
  });
  current.addEventListener("message", (message) => {
    const event = JSON.parse(message.data as string) as ServerEvent;
    useStore.setState((state) => applyEvent(state, event));
  });
}

// Dropped while disconnected: the UI disables sending then, and the server echoes
// everything it accepts, so nothing is shown that the server didn't get.
export function send(event: ClientEvent): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event));
}
