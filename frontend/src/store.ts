// App state. ws.ts writes it; components only read it.

import type { SnapshotEvent } from "@agent-office/shared";
import { create } from "zustand";

export type Connection = "connecting" | "open" | "closed";

interface State {
  connection: Connection;
  snapshot: SnapshotEvent | null;
}

export const useStore = create<State>()(() => ({
  connection: "connecting",
  snapshot: null,
}));
