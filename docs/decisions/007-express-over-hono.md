# 007: Express over Hono

**Decision:** The backend uses Express, with `ws` attached to the same HTTP server.

**Why:**
- The backend is tiny: one POST endpoint and a WebSocket.
- The new, risky parts are the Agent SDK, permissions and event streaming, so I don't want to also learn a new framework.
- Express + `ws` is well documented and easy to debug.

**Alternatives considered:**
- Hono (more modern, TypeScript-first). Not worth the extra unknown for this backend.

Details: [vision.md, Tech stack](../vision.md#4-tech-stack).
