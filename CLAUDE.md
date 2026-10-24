# Agent Office

A local web app (macOS, personal tool) that wraps Claude Code in a visual "office": agents are characters at desks on the left, and I chat with the manager agent on the right. A Node backend runs Claude Agent SDK sessions in a chosen project folder and streams events over a WebSocket to a React UI.

## Status

Pre-MVP. Working on [docs/plans/001-mvp.md](docs/plans/001-mvp.md).

## Tech stack

- Frontend: React + Vite + TypeScript, Zustand for state
- Office view: plain DOM + CSS blobs for the MVP (3D with React Three Fiber later)
- Styling: Tailwind CSS v4 (Vite plugin); design tokens in the `@theme` in `frontend/src/index.css`, blob animations as plain CSS `@keyframes` (decision 011)
- Backend: Node + TypeScript, Express with `ws` on the same HTTP server
- Agent engine: `@anthropic-ai/claude-agent-sdk` (TypeScript)

## Commands

To be added once the project is scaffolded.

## Rules

- Build only what the current plan file covers. No out-of-scope features "while you're there".
- Verify Claude Agent SDK usage against its current docs. Never guess API names or options.
- Backend/frontend event types live in `shared/`.
- The office renderer only reads store state; event-to-state logic lives outside it.
- The OAuth token never reaches the frontend or logs.
- The backend binds to `127.0.0.1` only.
- Never use the `allowedTools` option; it auto-approves tools and bypasses the approve/deny cards. Restrict tools with `tools`.
- App agent roles live in `backend/src/roles/`, not `.claude/agents/`.
- Don't build anything from `docs/design/future/` unless a plan file says so.
- Prefer small, readable code.
- Explain non-obvious decisions (in the commit message); I want to understand the "why".

## Docs map

- `docs/plans/001-mvp.md`: read at the start of every task; it defines what's in scope.
- `docs/plans/001-mvp-steps.md`: the build order, one commit per step; tick a step when it's done and committed.
- `docs/notes/sdk-events-sample.md`: read before changing `shared/events.ts` or the event → state mapping.
- `docs/vision.md`: read when you need details on architecture, auth, project selection, security, design, agents or the roadmap.
- `docs/design/layout.png`: read before any UI work (start screen, office, chat). Images are the source of truth for the look; when a task touches a design area, open the referenced image.
- `docs/design/future/`: 3D references. Ignore unless a plan file says otherwise.
- `docs/decisions/`: read before changing something a decision covers, or when you wonder why something is the way it is.
