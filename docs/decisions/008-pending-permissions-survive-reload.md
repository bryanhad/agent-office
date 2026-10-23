# 008: Pending permission requests survive a reload

**Decision:** The backend keeps pending permission requests keyed by id and sends a state snapshot (including any pending request) on every WebSocket connect. A request nobody answers within 10 minutes is denied, and the agent is told it timed out. Never auto-approve.

**Why:**
- Reloads are routine during development, so denying on disconnect would break the flow.
- Waiting forever would hang the SDK session.
- The snapshot is needed anyway so blob state survives a reload.

**Alternatives considered:**
- Deny on disconnect.
- Wait forever.

Details: [vision.md, Security](../vision.md#pending-permission-requests).
