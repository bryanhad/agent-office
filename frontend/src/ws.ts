// The WebSocket to the backend, through the Vite proxy at /ws on this page's own host.
// For now it only takes the project status from the snapshot and reconnects after a
// drop; applying live events comes later.

import type { ServerEvent } from "@agent-office/shared";
import { useStore } from "./store.ts";

const RETRY_MS = 2000;

export function connect(): void {
  const socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener("open", () => useStore.setState({ connection: "open" }));
  // A failed attempt fires "close" too, so this one handler also drives the retries.
  socket.addEventListener("close", () => {
    useStore.setState({ connection: "closed" });
    setTimeout(connect, RETRY_MS);
  });
  socket.addEventListener("message", (message) => {
    const event = JSON.parse(message.data as string) as ServerEvent;
    if (event.type === "snapshot") useStore.setState({ project: event.project });
  });
}
