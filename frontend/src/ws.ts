// The WebSocket to the backend, through the Vite proxy at /ws on this page's own host.
// For now it only stores the snapshot; reconnecting and applying live events come later.

import type { ServerEvent } from "@agent-office/shared";
import { useStore } from "./store.ts";

export function connect(): void {
  const socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener("open", () => useStore.setState({ connection: "open" }));
  socket.addEventListener("close", () => useStore.setState({ connection: "closed" }));
  socket.addEventListener("message", (message) => {
    const event = JSON.parse(message.data as string) as ServerEvent;
    if (event.type === "snapshot") useStore.setState({ snapshot: event });
  });
}
