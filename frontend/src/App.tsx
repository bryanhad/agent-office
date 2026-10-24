import { useStore } from "./store.ts";

// Placeholder until the start screen and the two-panel layout: proves the proxy and
// the WebSocket work by showing the snapshot the backend sends on connect.
export function App() {
  const connection = useStore((state) => state.connection);
  const snapshot = useStore((state) => state.snapshot);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Agent Office</h1>
      <p>WebSocket: {connection}</p>
      <pre style={{ background: "#f4f4f4", padding: 12, overflow: "auto" }}>
        {snapshot ? JSON.stringify(snapshot, null, 2) : "Waiting for the snapshot…"}
      </pre>
    </main>
  );
}
