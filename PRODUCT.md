# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: me, the developer who built it. I run it locally on my Mac to work with Claude Code on my own projects. My job in the app is to tell the manager agent what I want, watch what it does, and approve or deny its file edits and non-read-only commands before they happen.

## Product Purpose

Agent Office is a local web app that wraps Claude Code in a visual "office". The office panel on the left shows the open project as a room, with the project name on the wall and each agent as a character at a desk. The character's state shows what that agent is doing. The chat panel on the right is where I talk to the manager agent, see its streamed replies and tool activity, and answer permission requests.

Success for the MVP is the core loop working end to end: I type a message, the backend runs it through the Agent SDK in my chosen project on my subscription, the reply streams into the chat, the blob reflects what the agent is doing, and I approve or deny edits and commands in the chat. The full checklist is in `docs/plans/001-mvp.md`.

It is a personal tool, not a product: no accounts, no hosting, no other users.

**Long-term goal:** Agent Office becomes my main workspace and replaces my current Claude Code + terminal browser setup with no downgrade: an agent-driven browser I can also use (cookies, forms, logins), background processes such as dev servers visible in the UI, MCP servers and extra tools with permission policies, and subagents. None of this is MVP; the roadmap is in `docs/vision.md` §12.

## Positioning

The office is a glanceable picture of agent activity. Instead of reading a terminal transcript, I can see at a glance whether an agent is idle, thinking, working, waiting for me, or failing. Approvals stay in my hands: every edit and non-read-only command waits for my approval, except what the project's own committed `.claude/settings.json` allows, which the backend logs at startup. File reads inside the project and read-only commands (`ls`, `git status`) run without asking.

## Operating Context

- Runs on `127.0.0.1` on macOS, in a desktop browser. The backend owns the machine (Agent SDK sessions, files, commands); the frontend only renders events and sends my messages and decisions.
- **Full window is the primary experience.** Agent Office is meant to become my main workspace, used full screen the way I use Ghostty today (Claude Code on the left, a terminal browser on the right). Layout and design decisions are made for the full-width layout first.
- **Narrow widths are a supported fallback**, not the main case: a half-screen split or a side window must still work, down to the compact strip.
- At any width, the `waiting` state must be readable at a glance, including from the corner of my eye while I look at another part of the screen.
- Sometimes a **background tab**. Calling me back from it (tab title, favicon badge, browser notification) is a later feature, not MVP, but nothing should make it hard to add.
- One project per backend instance; several projects means several instances side by side, each on its own ports.
- Typical flow: open a project (start screen, or straight in when `PROJECT_DIR` is pinned), ask something, watch it stream, approve or deny a change, send follow-ups, sometimes queue messages while it works, cancel a queued message, or Stop the turn.

## Capabilities and Constraints

MVP (see `docs/plans/001-mvp.md` for scope; build only what the current plan covers):

- **Start screen:** a path input prefilled with `~/` and an inline error for an invalid path. It is skipped when `PROJECT_DIR` is valid, and shows a config warning when `PROJECT_DIR` is invalid. No recent-projects list.
- **Office:** the project name on the wall (from `package.json` `name`, else the folder name) and one blob, the Manager, at a desk.
- **Blob states (fixed):** `idle`, `thinking`, `working` (with a short activity label, e.g. "editing App.tsx", "running python3"), `waiting` (needs my approval) and `error`. **`waiting` must be the most noticeable state.** Colors and animations may change; the states and that rule may not.
- **Chat:**
  - streamed assistant text;
  - compact one-line tool rows, never raw JSON;
  - permission cards with the tool, the file or full command, and Approve / Deny;
  - queued messages, dimmed with a "Queued" mark and a cancel button; Esc cancels the last one, or Stops when nothing is queued;
  - a thinking indicator at the bottom while the agent works: a playful word per turn, elapsed seconds and the current activity;
  - a neutral "Stopped" line, and a Stop control visible only while the agent is busy;
  - a plain textarea: Enter sends, Shift+Enter adds a newline;
  - a chat panel about 480px wide, with the office taking the rest.
- **Paths:** a path outside the project folder carries an "outside the project" warning on tool lines and cards.
- **State survives a reload:** the chat, pending permission cards and queued messages are restored from the snapshot.
- **Office renderer is swappable:** it reads only plain store state (`project`, `agents`) and holds no event logic. The MVP blobs are plain DOM and CSS; a 3D office (React Three Fiber) comes later. A 2D pixel-art phase is not planned.
- **Later, not MVP:** multiple agents (Frontend, Backend, QA), `@` mentions, the agent browser and preview window, background processes (dev servers), MCP servers and extra tools, a usage bar, a model dropdown, diff previews on cards, a folder browser and recent projects, background-tab call-backs, sounds.
- **Terms:** project, office, wall, desk, agent, blob, Manager, role, state, chat, tool line, permission card, Approve / Deny, queued, cancelled, Stop, Stopped.

## Brand Commitments

- Name: **Agent Office**.
- Characters are the point of the app: friendly blobs (a round body, two eyes, a name and role label) at desks. The first-viewport mark in the wireframe is a blob face.
- **Voice has two registers:**
  - **Playful, lightly:** the office and the blobs (speech bubbles, a blob's idle line, office empty states) can have a bit of character.
  - **Plain and calm, always:** anything that asks for a decision or reports a problem (permission cards, errors, Stop, queued and cancelled labels, the start screen) is short and factual, like the wireframe's "Waiting for your approval" and "That folder doesn't exist. Check the path and try again." Never a joke there, and never at the cost of clarity.
- Visual source of truth for structure: `docs/design/layout.png` (a wireframe; colors and spacing in it are placeholders). `docs/design/future/` holds 3D references that are not MVP and must not be built from until a plan says so.

## Evidence on Hand

- `docs/design/layout.png`: wireframe of the start screen and the main screen (agent waiting for approval).
- `docs/vision.md`: architecture, auth, security, design intent, roadmap. `docs/plans/`: current scope and build order. `docs/decisions/`: reasoning behind decisions.
- No logo, illustrations, or other brand assets exist beyond the blob described above. No users, testimonials, or metrics, and none should be invented.

## Product Principles

1. **I decide.** Every edit and non-read-only command waits for my approval, except what the project's own committed settings allow, which is logged at startup. Reads and read-only commands don't ask. A decision is never buried, rushed, or made ambiguous.
2. **Readable at a glance.** The agent's state, above all `waiting`, must be clear at a glance, from the corner of my eye, in the full window and in the narrow fallback.
3. **Charm in the office, clarity in the decisions.** Personality lives in the characters and the room; the chat's controls and messages stay plain.
4. **Truthful activity.** Show what the agent is actually doing (one-line tool rows, full commands on cards, outside-project warnings), compactly and never as raw JSON.
5. **Small and swappable.** Build only what the current plan covers; the office renderer only reads state, so the blobs can become 3D later without touching anything else.

## Accessibility & Inclusion

- Every agent state must be distinguishable without color: shape, motion, bubble and label each carry it too.
- Respect `prefers-reduced-motion`: calmer or no animation. `waiting` must still stand out through color, its bubble and its label.
- Otherwise sensible defaults: full keyboard use (Enter, Shift+Enter, Esc already defined), readable contrast, and visible focus.
