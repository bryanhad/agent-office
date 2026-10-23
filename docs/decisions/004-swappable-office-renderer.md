# 004: The office renderer only reads store state

**Decision:** The office renderer draws plain state from the store (project name, agents with role and state) and nothing else. It never talks to the WebSocket or the backend and holds no logic about what an event means. Turning SDK events into agent states happens outside the renderer.

**Why:**
- The blob → 3D swap can happen without touching the backend, the chat, or the store.
- Event-to-state logic lives in one place and is written and tested once.

**Alternatives considered:**
- The renderer reads WebSocket events directly. Simpler on day one, but every new renderer reimplements the event logic.

Details: [vision.md, Architecture](../vision.md#rule-the-office-renderer-is-swappable).
