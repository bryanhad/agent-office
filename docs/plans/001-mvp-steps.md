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

- [ ] **7. Agent session (no permissions yet)**
  - Files: `backend/src/session.ts` (one streaming-input `query()` per opened project with the options from decision 009, including the `tools` allowlist and `MODEL`; logs the model the init message reports; feeds user messages; maps SDK messages to shared events per `docs/notes/sdk-events-sample.md`; keeps the chat log in memory for the snapshot; derives agent state: `tool_use` → working while the tool runs, its tool result → thinking; once step 8 adds approval, an approved request goes waiting → working → thinking the same way). Opening another project while one is busy denies any pending request and aborts the running query cleanly before starting the new one. Both error paths from decision 009 are handled: a turn error (`is_error: true`) and a thrown query (caught; the next message resumes the session). Error exit: the next user message moves the agent from `error` to `thinking`. `docs/vision.md` blob table gets the error-exit rule. Until step 8 the permission callback denies everything.
  - Verify (wscat): "what does this project do?" streams `assistant_text` with thinking → idle; the backend log shows the model; a follow-up remembers; switch project mid-turn and see the old query stop; with a garbage token see `error` and `agent_state: error`, the backend doesn't crash, and a new message moves to thinking.
  - Moves forward: D3, D6 (error), D8 (backend).

- [ ] **8. Permissions**
  - Files: `backend/src/permissions.ts` (pending requests keyed by `requestId`, 10-minute timeout that tells the agent it timed out, cleanup on `signal` abort, `PERMISSION_TIMEOUT_MS` override for testing), `session.ts`, `ws.ts`.
  - Verify (wscat): ask for a file change → `permission_request` + `waiting`; approve → file changes; deny → agent says so; reconnect while pending → snapshot has it and approve works; `PERMISSION_TIMEOUT_MS=10000` → auto-deny.
  - Moves forward: D4, D5, D9 (backend).

- [ ] **9. Frontend scaffold**
  - Files: Vite React TS app in `frontend/` with `zustand`; `vite.config.ts` (host `127.0.0.1`, port `WEB_PORT` (the same value the backend's Origin check uses) with `strictPort: true`, so Vite fails loudly when the port is taken instead of moving to another one whose Origin the backend would refuse with 403s; proxy `/api` and `/ws` to `PORT`; reads only those two keys from the environment or `backend/.env`); root `npm run dev` runs both with `concurrently`. Low priority: a `Host` header check in the backend against DNS rebinding, allowing only `127.0.0.1:<port>` and `localhost:<port>`; check what `Host` the Vite proxy forwards (its own `WEB_PORT` host, or the backend's with `changeOrigin`) and allow exactly that. This also closes the gap that `GET /api/project` has no Origin check.
  - Verify: `npm run dev`, open `http://127.0.0.1:5173`; `PORT=3002 WEB_PORT=5174 npm run dev` serves on 5174 and proxies to 3002; `curl -H 'Host: evil.example:3001' 127.0.0.1:3001/api/project` is refused while the app still works through the proxy.
  - Moves forward: D12.

- [ ] **10. Start screen**
  - Files: `frontend/src/StartScreen.tsx`, `frontend/src/store.ts` (project slice), `frontend/src/App.tsx`. Uses `GET /api/project`: none → start screen; pinned → straight to the main screen, no way to switch; invalid → start screen with "The project folder set in the backend config isn't valid: <reason>" and a working path input.
  - Verify: `~/nope` shows the inline error and a real folder opens; repeat with a valid and an invalid `PROJECT_DIR`.
  - Moves forward: D2, D10, D11.

- [ ] **11. Two-panel layout, WebSocket client, chat**
  - Files: `frontend/src/ws.ts` (connect, reconnect, pass events to the store), `frontend/src/store.ts` (`applyEvent`), `frontend/src/chat/ChatPanel.tsx`, `MessageList.tsx`, `ChatInput.tsx` (Enter sends, Shift+Enter newline; panel about 480px wide).
  - Verify: ask "what does this project do?" and watch it stream; a follow-up remembers; reload and the chat is still there.
  - Moves forward: D3, D8.

- [ ] **12. Tool lines and permission cards**
  - Files: `frontend/src/chat/ToolLine.tsx`, `frontend/src/chat/PermissionCard.tsx`.
  - Verify: ask for a small change, approve, check `git diff`; deny another and see the agent say so; reload while a card is showing, it comes back and approve works.
  - Moves forward: D4, D5, D9.

- [ ] **13. Office and blob**
  - Files: `frontend/src/office/Office.tsx`, `frontend/src/office/Blob.tsx`, `frontend/src/office/blob.css`. Reads only `project` and `agents` from the store.
  - Verify: the step 12 flow shows thinking → working → waiting → idle; a garbage token shows error; `grep -rn "ws\|WebSocket\|applyEvent" frontend/src/office` finds nothing.
  - Moves forward: D6, D7.

- [ ] **14. Commands, README, done-when**
  - Files: `CLAUDE.md` (Commands, including `backend/spike/sdk-spike.ts` as the manual SDK sanity check), `README.md`, `docs/plans/001-mvp.md` (tick done-when items after a full manual run, including two instances side by side).
  - Verify: follow the README from a fresh clone.
  - Moves forward: D12 and the final check of all items.
