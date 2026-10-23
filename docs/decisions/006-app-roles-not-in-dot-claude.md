# 006: App agent roles live in `backend/src/roles/`

**Decision:** Role definitions for the app's agents (Manager, Frontend engineer, Backend engineer, QA) live in `backend/src/roles/`, not in `.claude/agents/`.

**Why:** `.claude/agents/` is for agents that help build this repo, not for the agents the app runs.

**Alternatives considered:**
- Defining app roles in `.claude/agents/`.

Details: [vision.md, Agents and roles](../vision.md#9-agents-and-roles).
