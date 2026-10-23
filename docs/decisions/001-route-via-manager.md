# 001: Route `@` mentions through the manager

**Decision:** `@agent` messages go through the manager, which delegates to the addressed agent. There are no separate sessions per agent. The UI still animates the specific agent that is active.

**Why:**
- One coordinating context, so agents know what the others did.
- Cheaper: each separate session builds and pays for its own context.
- Matches how Claude Code subagents already work.
- The UI can still animate the active agent, because subagent events say which one is running.

**Alternatives considered:**
- A separate SDK session per agent. Feels more real, but there's no shared context, context must be passed manually, and it uses more tokens.

Details: [vision.md, Agents and roles](../vision.md#9-agents-and-roles).
