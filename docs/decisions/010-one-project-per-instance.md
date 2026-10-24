# 010: One project per backend instance

**Decision:** A backend instance works on one project at a time. Working on several projects at once means running several instances side by side, each with its own `PORT`, `WEB_PORT` and (optionally) `PROJECT_DIR`. Docker Compose is out of scope for now.

**Why:**
- One project per instance keeps the backend simple: one session, one pending-request map, one chat log, and no project IDs in every event.
- Separate instances can't interfere with each other. Each has its own ports, its own Origin check and its own session in its own `cwd`.

**Why not Docker Compose (for now):**
- The agent and the project's tooling (node, git, test runners) would run inside the container, not on my Mac.
- Mounts change what paths and `~` mean, so project paths and `~/.claude/projects/` transcripts would need remapping.
- The `127.0.0.1` binding needs rework, because a container's port only reaches the host when it listens on all interfaces inside the container.
- Revisit later as a sandboxing option.

**Alternatives considered:**
- Several projects in one backend (one session per project, project ID on every event). More code for something separate instances already give.

Details: [vision.md, Project directory selection](../vision.md#6-project-directory-selection).
