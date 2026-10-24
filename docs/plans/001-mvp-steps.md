# Plan 001: MVP implementation steps

The step-by-step build order for [001-mvp.md](001-mvp.md). One commit per step. Tick a step once it's done and committed.

Done-when key (from 001-mvp.md):

- D1 backend refuses to start without the token
- D2 open a project; an invalid path shows an error
- D3 streamed answer about the project
- D4 approve a change and the file changes
- D5 deny stops the change and the agent says so
- D6 blob shows thinking / working / waiting / idle / error
- D7 blob reads only store state
- D8 follow-up remembers the conversation
- D9 reload with a pending request shows the card again and approve still works
- D10 valid `PROJECT_DIR` opens straight into the main screen
- D11 invalid `PROJECT_DIR` shows the config warning and a manual path still works
- D12 two instances with different `PORT` / `WEB_PORT` / `PROJECT_DIR` run side by side
- D13 a message sent while busy shows as queued and is delivered when the turn ends
- D14 a queued message can be cancelled (button or Esc) and the agent never sees it
- D15 Stop interrupts the agent, cancels queued messages and pending permissions, blob goes idle
- D16 restarting the backend restores the chat and the agent remembers the conversation
- D17 after a restart, a pending card and queued messages come back as cancelled
- D18 New chat starts a fresh session with an empty chat

## Steps

- [x] **1. Agent SDK spike**
  - Files: `backend/package.json`, `backend/tsconfig.json`, `backend/spike/sdk-spike.ts`, lockfile.
  - Standalone script: loads `CLAUDE_CODE_OAUTH_TOKEN` from `backend/.env`, exits without it, strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY` (warns by name only). Runs one streaming-input `query()` in the folder given as an argument with `settingSources: ["project"]`, `permissionMode: "default"`, the `claude_code` system prompt preset and `disallowedTools: ["AskUserQuestion"]`. Turn 1 asks for a file to be created (y/n in the terminal at the permission callback); turn 2 asks what file it tried to create. Prints every event and `apiKeySource`.
  - Verify: `cd backend && npx tsx spike/sdk-spike.ts <folder>`; run once answering y, once answering n, and once with `CLAUDE_CODE_OAUTH_TOKEN=garbage` to check the SDK doesn't fall back to the Claude Code login.
  - Moves forward: de-risks D1, D3, D4, D5, D8.

- [x] **2. Record spike findings and decisions (docs only)**
  - Files: `docs/vision.md` (§5 stripped variables, subscription proof, `MODEL`; §6 `PROJECT_DIR`, one project per instance; §7 permission wording, Origin check, `allowedTools` ban, `~/.claude/projects/` note; roadmap: usage bar, model dropdown, per-agent models; blob table error exit is added in step 7), `docs/decisions/002-oauth-token-required.md` (extra variables, proof, subscription-use note), new `docs/decisions/009-streaming-input-session.md`, new `docs/decisions/010-one-project-per-instance.md` (multiple projects = multiple instances; Docker Compose out of scope for now), new `docs/notes/sdk-events-sample.md` (trimmed spike logs and findings), `docs/plans/001-mvp.md` (D10–D12, `PROJECT_DIR`, configurable ports, `MODEL`), `CLAUDE.md` (`allowedTools` rule, docs map), delete `PROJECT_BRIEF.md`.
  - Verify: read the diff.

- [x] **3. Root workspace and backend startup**
  - Files: root `package.json` (npm workspaces `backend`, `frontend`, `shared`), root lockfile (replaces `backend/package-lock.json`), `tsconfig.base.json`, `backend/tsconfig.json`, `backend/package.json` (`dev` = `tsx watch`, `start` = `tsx`, Express 5), `backend/src/env.ts` (load `.env`, require the token, strip the variables, read `PORT` default 3001, `WEB_PORT` default 5173, `PROJECT_DIR`, `MODEL`), `backend/src/index.ts` (Express on `127.0.0.1:${PORT}`, `GET /api/health`), `backend/.env.example` (`PORT`, `WEB_PORT`, `PROJECT_DIR`, `MODEL` commented out). Real environment variables override `.env`.
  - Verify (with `npm start`, because `npm run dev` watches and keeps waiting after an exit): `CLAUDE_CODE_OAUTH_TOKEN= npm start -w backend` exits with a clear message; with the token `curl 127.0.0.1:3001/api/health` answers and `lsof -nP -iTCP:3001 -sTCP:LISTEN` shows `127.0.0.1` only; `ANTHROPIC_API_KEY=x npm start -w backend` warns without the value; `PORT=3002 MODEL=sonnet npm start -w backend` listens on 3002 and logs the model.
  - Moves forward: D1, D12.

- [x] **4. Shared event types**
  - Files: `shared/package.json` (`@agent-office/shared`, types only), `shared/tsconfig.json`, `shared/events.ts` (`AgentState`, `Agent`, `Project`; server events `snapshot`, `user_message`, `assistant_text`, `tool_use`, `permission_request`, `permission_resolved`, `agent_state`, `error`, with `ChatEvent` as the replayable subset; client events `send_message`, `permission_response`; `ProjectStatus` with the three config cases none / pinned / invalid; HTTP `OpenProjectRequest`, `ProjectResponse`, `ApiError`), `backend/package.json` (depends on the shared workspace). No `result` event: a finished turn is `agent_state` idle, a failed one is `error`. No separate pending field in the snapshot: an unresolved `permission_request` in the replayed chat is the pending request.
  - Verify: `npx tsc -p shared` and `npx tsc --noEmit -p backend` pass.
  - Moves forward: groundwork for all.

- [x] **5. Project endpoint and `PROJECT_DIR`**
  - Files: `backend/src/project.ts` (expand `~`, `path.resolve`, must be a directory, name from `package.json` falling back to the folder name; warn listing the rules if the project's `.claude/settings.json` has `permissions.allow`), `backend/src/origin.ts` (allow only `http://127.0.0.1:${WEB_PORT}` and `http://localhost:${WEB_PORT}`), `backend/src/index.ts` (`GET /api/project` returns the current project and config case; `POST /api/project` opens one, refused while pinned; `PROJECT_DIR` validated at startup: valid → opened and pinned, invalid → keep running and report the reason).
  - Verify: curl `POST` with a real folder, `~/nope`, a file, and a bad `Origin`; start with a valid `PROJECT_DIR` and check `GET` reports pinned and `POST` is refused; start with an invalid one and check `GET` reports the reason and `POST` still works; open a project with an allow rule and see the warning.
  - Moves forward: D2, D10, D11 (backend).

- [x] **6. WebSocket and snapshot**
  - Files: `backend/src/ws.ts` (`ws` on the same server at `/ws`, Origin check, broadcast, snapshot on connect with project status, agents and the chat so far, whose unresolved `permission_request` is the pending one). Every incoming message is validated at runtime with a zod schema in the backend (`ClientEvent` is only a type); anything that isn't valid JSON or doesn't match is dropped with a log line. This socket can approve shell commands.
  - Verify: `npx wscat -c ws://127.0.0.1:3001/ws -o http://127.0.0.1:5173` gets a snapshot; `-o http://evil.example` is refused; sending `hello`, `{}` or `{"type":"permission_response","id":1}` is dropped and logged, and the connection stays usable.
  - Moves forward: D9 groundwork.

- [x] **7. Agent session (no permissions yet)**
  - Files: `backend/src/session.ts` (one streaming-input `query()` per opened project with the options from decision 009, including the `tools` allowlist and `MODEL`; logs the model the init message reports; feeds user messages; maps SDK messages to shared events per `docs/notes/sdk-events-sample.md`; keeps the chat log in memory for the snapshot; derives agent state: `tool_use` → working while the tool runs, its tool result → thinking; once step 8 adds approval, an approved request goes waiting → working → thinking the same way). Opening another project while one is busy denies any pending request and aborts the running query cleanly before starting the new one. Both error paths from decision 009 are handled: a turn error (`is_error: true`) and a thrown query (caught; the next message resumes the session). Error exit: the next user message moves the agent from `error` to `thinking`. `docs/vision.md` blob table gets the error-exit rule. Until step 8 the permission callback denies everything.
  - Verify (wscat): "what does this project do?" streams `assistant_text` with thinking → idle; the backend log shows the model; a follow-up remembers; switch project mid-turn and see the old query stop; with a garbage token see `error` and `agent_state: error`, the backend doesn't crash, and a new message moves to thinking.
  - Moves forward: D3, D6 (error), D8 (backend).

- [x] **8. Permissions**
  - Files: `backend/src/permissions.ts` (pending requests keyed by `requestId`, 10-minute timeout that tells the agent it timed out, cleanup on `signal` abort, `PERMISSION_TIMEOUT_MS` override for testing), `session.ts`, `ws.ts`.
  - Verify (wscat): ask for a file change → `permission_request` + `waiting`; approve → file changes; deny → agent says so; reconnect while pending → snapshot has it and approve works; `PERMISSION_TIMEOUT_MS=10000` → auto-deny.
  - Moves forward: D4, D5, D9 (backend).

- [x] **8b. Message queue and Stop (backend)**
  - Files:
    - `shared/events.ts`: decide the event shapes here. At least a queued state for a `user_message` that a reconnect can replay; a "delivered" and a "cancelled" change; client events to cancel one queued message and to stop. Plus the zod schemas in `ws.ts`.
    - `backend/src/session.ts` or a small module next to it: the backend queue. Messages sent while the agent is busy stay there, not in the SDK input. The next one is pushed into the query when the turn goes idle.
    - Stop calls `query.interrupt()`, marks all queued messages cancelled, and cancels pending permissions (`permission_resolved` "cancelled", via `permissions.ts`). State goes to `idle`.
    - Check against the SDK docs what `interrupt()` does to the running turn (whether a `result` follows, and what it looks like) before mapping it.
  - Verify (wscat):
    - send while busy → queued, delivered after idle;
    - cancel a queued one → the agent never answers it;
    - reconnect with a queued message → the snapshot has it as queued;
    - Stop mid-turn with one queued and one pending request → turn stops, both cancelled, `idle`;
    - a follow-up after Stop still works.
  - Moves forward: D13, D14, D15 (backend).

- [x] **9. Frontend scaffold**
  - Files: Vite React TS app in `frontend/` with `zustand`; `vite.config.ts` (host `127.0.0.1`, port `WEB_PORT` (the same value the backend's Origin check uses) with `strictPort: true`, so Vite fails loudly when the port is taken instead of moving to another one whose Origin the backend would refuse with 403s; proxy `/api` and `/ws` to `PORT`; reads only those two keys from the environment or `backend/.env`); root `npm run dev` runs both with `concurrently`. Low priority: a `Host` header check in the backend against DNS rebinding, allowing only `127.0.0.1:<port>` and `localhost:<port>`; check what `Host` the Vite proxy forwards (its own `WEB_PORT` host, or the backend's with `changeOrigin`) and allow exactly that. This also closes the gap that `GET /api/project` has no Origin check.
  - Verify: `npm run dev`, open `http://127.0.0.1:5173`; `PORT=3002 WEB_PORT=5174 npm run dev` serves on 5174 and proxies to 3002; `curl -H 'Host: evil.example:3001' 127.0.0.1:3001/api/project` is refused while the app still works through the proxy.
  - Moves forward: D12.

- [x] **10. Start screen**
  - Files: `frontend/src/StartScreen.tsx`, `frontend/src/store.ts` (project slice), `frontend/src/App.tsx`. The project status comes from the WebSocket snapshot (sent on connect and broadcast after every successful `POST /api/project`, so every tab switches), not `GET /api/project`: none → start screen; pinned → straight to the main screen, no way to switch; invalid → start screen with "The project folder set in the backend config isn't valid: <reason>" and a working path input.
  - Verify: `~/nope` shows the inline error and a real folder opens; repeat with a valid and an invalid `PROJECT_DIR`.
  - Moves forward: D2, D10, D11.

- [x] **11. Two-panel layout, WebSocket client, chat**
  - Files: `frontend/src/ws.ts` (connect, reconnect, pass events to the store), `frontend/src/store.ts` (`applyEvent`), `frontend/src/chat/ChatPanel.tsx`, `MessageList.tsx`, `ChatInput.tsx` (Enter sends, Shift+Enter newline; panel about 480px wide). Queued messages show dimmed with a "Queued" mark and a cancel button; Esc in the input cancels the last queued one. A Stop button is visible only while the agent is busy (thinking, working or waiting).
  - Verify:
    - ask "what does this project do?" and watch it stream;
    - a follow-up remembers;
    - reload and the chat is still there;
    - send while busy → queued, then delivered;
    - cancel one with the button and one with Esc;
    - Stop mid-turn → idle.
  - Moves forward: D3, D8, D13, D14, D15.

- [ ] **12. Tool lines and permission cards**
  - Files: `frontend/src/chat/ToolLine.tsx`, `frontend/src/chat/PermissionCard.tsx`.
  - Files (continued): tool lines and cards with `outsideProject` show a visible "outside the project" warning. A card resolved as `cancelled` (Stop, project switch) shows as cancelled without buttons.
  - Note: keep the tool name and its target visibly apart. The step 11 placeholder row ran them together ("Bashls -la …").
  - Verify:
    - ask for a small change, approve, check `git diff`;
    - deny another and see the agent say so;
    - reload while a card is showing; it comes back and approve works;
    - Stop while a card is showing → card shows cancelled.
  - Moves forward: D4, D5, D9, D15.

- [ ] **13. Office and blob**
  - Files: `frontend/src/office/Office.tsx`, `frontend/src/office/Blob.tsx`, `frontend/src/office/blob.css`. Reads only `project` and `agents` from the store.
  - Verify: the step 12 flow shows thinking → working → waiting → idle; a garbage token shows error; `grep -rn "ws\|WebSocket\|applyEvent" frontend/src/office` finds nothing.
  - Moves forward: D6, D7.

- [ ] **13b. Survive a backend restart**
  - Files: a small persistence module in `backend/src/` (e.g. `saved.ts`), `backend/src/session.ts`, `backend/src/chat.ts`, `backend/src/ws.ts` (zod schema for the new client event), `shared/events.ts` (a "new chat" client event; a neutral notice chat item if no existing event fits), the chat header in `frontend/src/chat/ChatPanel.tsx`.
  - Agent memory: save the last SDK `session_id` per project, keyed by its absolute path, under `~/.agent-office/`, and pass it as `resume` when the project opens. If resume fails, start a fresh session and add a neutral chat line saying the previous session couldn't be resumed. Check the SDK docs for how a failed `resume` shows up before mapping it.
  - Chat display: write the chat log per project under `~/.agent-office/` as it changes, and load it when the project opens, so the snapshot restores it.
  - At restart: a `permission_request` with no `permission_resolved` is restored with a `permission_resolved` "cancelled" (the backend restarted), and queued messages are restored as cancelled. Nothing is sent without me seeing it.
  - New chat: a plain "New chat" control in the chat header (like `/clear`) starts a fresh SDK session and an empty chat for this project, and the saved session and log are replaced.
  - Verify:
    - have a short conversation, restart the backend, reload: the chat is back and a follow-up remembers it;
    - restart with a card pending and a message queued: both come back cancelled and nothing reaches the agent;
    - corrupt the saved session id: a fresh session starts with the neutral line;
    - New chat: empty chat, and the agent no longer remembers.
  - Moves forward: D16, D17, D18.

- [ ] **14. Commands, README, done-when**
  - Files: `PRODUCT.md` (update Capabilities and Constraints to match the shipped MVP), `CLAUDE.md` (Commands, including `backend/spike/sdk-spike.ts` as the manual SDK sanity check and `backend/spike/write-probe.ts`, to run after every SDK upgrade because the auto-approved memory folder is inside Claude Code; see decision 009), `README.md`, `docs/plans/001-mvp.md` (tick done-when items after a full manual run, including two instances side by side).
  - Verify: follow the README from a fresh clone.
  - Moves forward: D12 and the final check of all items.
