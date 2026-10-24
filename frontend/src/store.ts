// App state. ws.ts and api.ts write it; components only read it.

import type { ProjectStatus } from "@agent-office/shared";
import { create } from "zustand";

// "closed" also covers the retries after a drop, so the UI doesn't flicker between them.
export type Connection = "connecting" | "open" | "closed";

interface State {
  connection: Connection;
  // The project slice: from every snapshot, and from a successful POST /api/project.
  // null until the first snapshot arrives.
  project: ProjectStatus | null;
}

export const useStore = create<State>()(() => ({
  connection: "connecting",
  project: null,
}));
