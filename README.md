# Agent Office

A local web app that wraps Claude Code in a visual "office": agents appear as characters at desks on the left, and you chat with them on the right. A Node backend runs a Claude Agent SDK session in the project folder you pick, on your Claude subscription, and streams what the agent does to a React UI. Every file edit and non-read-only command waits for your Approve / Deny in the chat.

A personal tool that runs only on macOS, not a product.

**Status: MVP.** One agent (the Manager), one project per instance. See [docs/plans/001-mvp.md](docs/plans/001-mvp.md) for what the MVP covers and [docs/vision.md](docs/vision.md) for the full picture and roadmap.

## Requirements

- macOS
- Node 24 (tested with 24.14)
- A Claude subscription (Pro or Max) and the `claude` CLI, to generate a token with `claude setup-token`

## Setup

```bash
npm install
cp backend/.env.example backend/.env
claude setup-token          # paste the token into backend/.env as CLAUDE_CODE_OAUTH_TOKEN
npx impeccable install      # restores Impeccable; its binary isn't committed
```

The backend refuses to start without `CLAUDE_CODE_OAUTH_TOKEN`. It removes `ANTHROPIC_API_KEY` and the other credential variables from its environment, so the session always runs on the subscription token (see [decision 002](docs/decisions/002-oauth-token-required.md)). The token never reaches the browser or the logs.

## Run

```bash
npm run dev
```

Open http://127.0.0.1:5173, enter a project folder, and start chatting. `npm start` does the same without restarting the backend on file changes.

### Config

All optional, in `backend/.env`. Variables set in your shell override the file, e.g. `PROJECT_DIR=~/code/app npm run dev`.

| Variable | Default | What it does |
| --- | --- | --- |
| `PROJECT_DIR` | unset | Opens this folder on startup and skips the start screen. The instance is then pinned to it. An invalid folder shows a warning on the start screen. |
| `PORT` | `3001` | Backend port. |
| `WEB_PORT` | `5173` | Frontend (Vite) port. The backend only accepts requests from this origin. |
| `MODEL` | account default | Main model, an alias (`sonnet`) or a full model ID. |
| `PERMISSION_TIMEOUT_MS` | `600000` (10 min) | How long a permission card waits before it's denied. Shorten only for testing. |

Both servers bind to `127.0.0.1` only.

### Two projects side by side

One instance holds one project ([decision 010](docs/decisions/010-one-project-per-instance.md)). For a second project, run a second instance on other ports, in another terminal:

```bash
PORT=3002 WEB_PORT=5174 PROJECT_DIR=~/code/other npm run dev
```

and open http://127.0.0.1:5174. Each project's chat and SDK session are saved separately under `~/.agent-office/`, keyed by the folder's absolute path, so a restart picks up where you left off.

## Scripts

Both run against the real SDK on your subscription, from `backend/`. Folder arguments are resolved from `backend/`, so use an absolute or `~/` path.

- **`npm run sdk-spike -w backend -- <folder>`**: a manual SDK sanity check. Runs two turns in `<folder>` (create `spike.txt`, then ask about it), prints every SDK event and asks `y/n` for each permission request. Use it when SDK behaviour looks off, or to see the raw events before changing the event mapping.
- **`npm run write-probe -w backend [-- <folder>]`**: run it **after every SDK upgrade and after any change to `backend/src/agent-options.ts`**. It uses the app's real options and checks that every file write (Claude Code's memory folder, `~/.claude/`, `~/`, the project) reaches the approve/deny callback. It exits 1 if any write skipped it, and 2 if the agent never attempted one. Claude Code once auto-approved writes into its memory folder; see [decision 009](docs/decisions/009-streaming-input-session.md).

Also: `npm run typecheck` (all workspaces) and `npm run build` (frontend build, a compile check only).
