# 009: One streaming-input query per project, with fixed SDK options

**Decision:** Each opened project gets one long-lived `query()` in streaming input mode: `prompt` is an async iterable, and each chat message is pushed into it as an `SDKUserMessage`. The query is created with these options:

| Option | Value | Why |
| --- | --- | --- |
| `cwd` | the project's absolute path | The agent works in that project. |
| `settingSources` | `["project"]` | Loads the project's `CLAUDE.md`, rules and `.claude/settings.json`. Skips `~/.claude` and `.claude/settings.local.json`, whose allow rules, `defaultMode` or `apiKeyHelper` would bypass the approve card or the OAuth token. |
| `permissionMode` | `"default"` | Set explicitly so no settings file can start the session in `acceptEdits` or `bypassPermissions`. |
| `systemPrompt` | `{ type: "preset", preset: "claude_code" }` | The SDK default is a minimal prompt, not Claude Code's. |
| `tools` | `["Read", "Glob", "Grep", "Edit", "Write", "Bash"]` | The default tool list depends on the account and the Claude Code version (the spike saw `WebFetch`, `RemoteTrigger`, `DesignSync` appear in one run and not another, and no `Glob`/`Grep` at all). An explicit list keeps the MVP's surface fixed. |
| `allowedTools` | not set (empty) | It auto-approves tools, which would bypass the approve/deny cards. |
| `disallowedTools` | `["AskUserQuestion"]` | It goes through `canUseTool` and the MVP has no UI for it, so the agent asks in plain text instead. |
| `includePartialMessages` | `true` | Needed for `text_delta` stream events (streaming text in the chat). |
| `canUseTool` | the backend's permission handler | Holds the request until approve, deny or the 10-minute timeout ([decision 008](008-pending-permissions-survive-reload.md)). |
| `model` | `MODEL` from `backend/.env`, if set | Otherwise the account default. The backend logs the model the init message reports. `MODEL` sets the main model only; Claude Code also uses a small background model (`claude-haiku-5-5` in `modelUsage`). |

**Errors:** there are two error paths, and neither may stop the backend.
- **Turn error:** a `result` with `is_error: true` (its `subtype` can still be `"success"`). Emit `error` and `agent_state: error`. The query keeps running, and the next user message moves the agent to `thinking`.
- **Query error:** the `for await` loop throws (e.g. "Claude Code returned an error result" once the input has ended, or the process dies). Catch it, emit `error` and `agent_state: error`, and mark the query finished. The next user message starts a new query with `resume: <session_id>`, so the conversation is kept.

**Why streaming input:**
- The docs recommend it for chat UIs. It keeps one session across turns without tracking IDs, and it allows `interrupt()` and `setModel()` later (the model dropdown on the roadmap).
- The spike confirmed it: turn 2 remembered turn 1, both turns had the same `session_id`, and each turn ended with its own `result`.

**Alternatives considered:**
- A new `query()` per message with `continue: true`. Rejected: it resumes the most recent session in the folder, which could be a Claude Code CLI session I have open in the same project.
- A new `query()` per message with `resume: <session_id>`. Workable, but loses `interrupt()` and `setModel()`. Used only to recover after a query error.
- `settingSources: []`. No auto-approval at all, but the agent loses the project's `CLAUDE.md`, which matters for "what does this project do?".

Details: [vision.md, Security](../vision.md#7-security), [sdk-events-sample.md](../notes/sdk-events-sample.md).
