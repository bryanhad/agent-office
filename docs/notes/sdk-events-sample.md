# Agent SDK events: samples from the spike

Trimmed output of `backend/spike/sdk-spike.ts` (Agent SDK 0.3.309, Claude Code 2.1.309), taken from three runs: approve, deny, and a garbage token. Each run had two turns: "Create a file named spike.txt … containing the word hello." and "What file did you just try to create, and did it work?".

Read this before changing `shared/events.ts` or the event → state mapping.

Trimming: `…` marks removed fields or array items. The target folder is shown as `/tmp/spike-test`, home paths as `~`, and IDs are shortened. Stream events are shown as the spike printed them (event type, plus the delta for `content_block_delta`), not as raw JSON.

## Findings

1. **No credential fallback.** A garbage `CLAUDE_CODE_OAUTH_TOKEN` fails every turn with `401 Invalid bearer token`. The SDK doesn't fall back to the Mac's stored Claude Code login.
2. **`apiKeySource` proves nothing.** It's `none` for the OAuth token. Proof of subscription use is the 401 above, plus the `rate_limit_event` with `five_hour` / `seven_day` utilization in a real run.
3. **An auth error comes back as `subtype: "success"`.** The `result` has `is_error: true`, `subtype: "success"`, `terminal_reason: "api_error"`. Detect errors with `is_error`, never with `subtype`.
4. **The SDK fakes an assistant message for API errors.** It has `model: "<synthetic>"` and `is_api_error_message: true`, and its text is the error. Show it as an error, not as a reply.
5. **`query()` throws at the end, not at the error.** In streaming input mode, turn 2 still ran after turn 1's error result. The `for await` loop threw "Claude Code returned an error result: …" only after the input ended.
6. **Retries are visible.** `system/api_retry` messages (with `attempt`, `max_retries`, `error_status`, `error`) arrive before the error result.
7. **Every turn starts with a new `system/init`**, with the same `session_id`, and ends with its own `result` (`result_index` counts turns from 0). `init` doesn't mean "session started".
8. **Follow-ups remember.** Turn 2 knew about turn 1's file in the approve and deny runs; all messages in a run share one `session_id`.
9. **Text arrives twice.** First as `text_delta` stream events, then as a complete `assistant` message for the same block, sent before that block's `content_block_stop`. Build chat text from the deltas only. One `assistant` message carries one content block (`thinking`, `text` or `tool_use`).
10. **Thinking is empty.** `thinking_delta` arrives with `"thinking": ""`, and the `thinking` block has only a signature. A thinking block starting is the signal for the `thinking` state; there is no text to show.
11. **Tool input streams as `input_json_delta`** before the complete `assistant` `tool_use` block. Use the complete block for tool lines.
12. **The permission callback gets a ready-made label.** `options.description` is `"spike.txt"` and `options.displayName` is `"Write"`. `input.file_path` is absolute, so tool lines should show it relative to the project.
13. **`suggestions` offers `setMode: acceptEdits`.** Never apply it (no auto-approve).
14. **Tool results come back as `user` messages.** Each carries a `tool_result` block, a structured `tool_use_result` (e.g. `type: "create"`, `filePath`), and `tool_result_meta[].permission_decision` (`accept` / `user_temporary`, or `reject` / `user_reject`). On deny, the `tool_result` has `is_error: true` with the deny message, and the turn's `result.permission_denials` lists the call.
15. **A second, smaller model runs in the background.** `modelUsage` shows `claude-haiku-5-5` next to the main model. `MODEL` sets the main model only.
16. **The model depends on the account.** The garbage run reported `claude-sonnet-5-5` and the real run `claude-opus-5-5` (the account default).
17. **The tool list depends on the account and the Claude Code version.** The real run added `WebFetch`, `RemoteTrigger` and `DesignSync`, and neither run listed `Glob` or `Grep`. Hence the explicit `tools` list in [decision 009](../decisions/009-streaming-input-session.md).
18. **Some files land outside the repo regardless of `settingSources`.** `memory_paths.auto` and the transcripts are under `~/.claude/projects/<encoded-cwd>/`. Example: `/tmp/spike-test` becomes `~/.claude/projects/-private-tmp-spike-test/` (macOS resolves `/tmp` to `/private/tmp`, then slashes become dashes). Auto-memory is now off; see finding 21.
19. **Cost figures aren't billing.** `total_cost_usd` and `modelUsage[].costUSD` are reported at list price (`costBasis: "list"`) even on the subscription. `total_cost_usd` and `modelUsage` are the session total so far; `model_usage_since_last_result` is this turn only. Confirmed from an approve run's turn-2 result: `total_cost_usd` 0.0167734 = `modelUsage` opus 0.0166458 + haiku 0.0001276, while `model_usage_since_last_result` was 0.0060162. Don't show any of them as charges.
20. **Status messages.** `system/status` with `status: "requesting"` precedes each model request.
21. **Auto-memory writes bypass `canUseTool`.** Found in the step 7 build with a deny-everything callback, in a folder with no `.claude/`. "Remember the codeword banana. Just reply ok." made the agent write `codeword-banana.md` and `MEMORY.md` into `~/.claude/projects/-private-tmp-ao-clean/memory/` with no `permission_request`. Their tool lines read `../../../Users/…`. The fix has two parts:
    - `autoMemoryEnabled: false` (plus `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`) stops the agent from writing memories on its own: the banana message just gets "ok", and `system/init` has `memory_paths: {}`. But Claude Code **still auto-approves writes into the memory folder**: an explicit "Write ~/.claude/projects/…/memory/codeword.md" succeeded without the callback.
    - A flag-settings `permissions.ask: ["Edit(~/.claude/**)"]` closes that. The same write then reaches `canUseTool` and is denied. Writes to the rest of `~/.claude`, `~/` and the project reached the callback with or without the rule.
    - The memory folder is keyed by git repo (or by folder outside a repo), shared by all worktrees and subfolders, and shared with CLI sessions in the same folder: a memory written here would be loaded into my own Claude Code sessions there.
    - The `file_path` input can be `~/…` or relative, not always absolute.
    - `backend/spike/write-probe.ts` repeats the check; run it after every SDK upgrade.
22. **Parallel tool calls ask one at a time.** In step 8, two parallel `Write` calls in one assistant message produced two `tool_use` lines at once, but `canUseTool` for the second came only after the first was answered. `permissions.ts` still allows several pending requests and stays `waiting` until all are settled, in case a version asks concurrently.

## Samples

### `system/init` (one per turn)

```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/tmp/spike-test",
  "session_id": "f6df48ed-…",
  "tools": ["Task", "Bash", "CronCreate", "CronDelete", "CronList", "DesignSync", "Edit", "…", "Read", "…", "WebFetch", "WebSearch", "Workflow", "Write"],
  "mcp_servers": [],
  "model": "claude-opus-5-5",
  "permissionMode": "default",
  "slash_commands": ["…"],
  "apiKeySource": "none",
  "claude_code_version": "2.1.309",
  "output_style": "default",
  "agents": ["claude", "Explore", "general-purpose", "Plan", "statusline-setup"],
  "skills": ["…"],
  "plugins": [{ "name": "cc-plugin-agents-md", "path": "builtin", "source": "cc-plugin-agents-md@builtin" }, "…"],
  "capabilities": ["interrupt_receipt_v1", "…"],
  "memory_paths": { "auto": "~/.claude/projects/-private-tmp-spike-test/memory/" },
  "fast_mode_state": "off",
  "…": "…"
}
```

### `system/status`

```json
{ "type": "system", "subtype": "status", "status": "requesting", "session_id": "f6df48ed-…", "uuid": "…" }
```

### `rate_limit_event` (real token only)

```json
{
  "type": "rate_limit_event",
  "rate_limit_info": {
    "status": "allowed",
    "resetsAt": 1792826400,
    "rateLimitType": "five_hour",
    "overageStatus": "rejected",
    "isUsingOverage": false,
    "unifiedWindows": {
      "five_hour": { "utilization": 0.1, "resetsAt": 1792826400 },
      "seven_day": { "utilization": 0.19, "resetsAt": 1792825200 }
    }
  },
  "session_id": "f6df48ed-…"
}
```

### `stream_event` deltas

Turn 1 (tool call):

```
[stream_event] message_start
[stream_event] content_block_start
[stream_event] content_block_delta input_json_delta {"type":"input_json_delta","partial_json":"{\"file_path\": \"/tmp/spike-test/"}
[stream_event] content_block_delta input_json_delta {"type":"input_json_delta","partial_json":"spike.txt\", \"content\": \"hello\\n\"}"}
   ← complete [assistant] tool_use message arrives here
[stream_event] content_block_stop
[stream_event] message_delta
[stream_event] message_stop
```

Turn 2 (thinking, then text):

```
[stream_event] message_start
[stream_event] content_block_start
[stream_event] content_block_delta thinking_delta {"type":"thinking_delta","thinking":"","estimated_tokens":null}
[stream_event] content_block_delta signature_delta {"type":"signature_delta","signature":"CAQS0QQK…"}
   ← complete [assistant] thinking message arrives here
[stream_event] content_block_stop
[stream_event] content_block_start
[stream_event] content_block_delta text_delta {"type":"text_delta","text":"I created"}
[stream_event] content_block_delta text_delta {"type":"text_delta","text":" `spike.txt` in"}
…
   ← complete [assistant] text message arrives here
[stream_event] content_block_stop
[stream_event] message_delta
[stream_event] message_stop
```

### `assistant` with `tool_use`

```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-5-5",
    "id": "msg_011C…",
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01M5…",
        "name": "Write",
        "input": { "file_path": "/tmp/spike-test/spike.txt", "content": "hello\n" },
        "caller": { "type": "direct" }
      }
    ],
    "stop_reason": null,
    "usage": { "…": "…" }
  },
  "parent_tool_use_id": null,
  "session_id": "f6df48ed-…",
  "uuid": "…",
  "timestamp": "2026-10-24T02:47:25.191Z"
}
```

### Permission request (`canUseTool` arguments, `signal` omitted)

```json
{
  "toolName": "Write",
  "input": { "file_path": "/tmp/spike-test/spike.txt", "content": "hello\n" },
  "options": {
    "suggestions": [{ "type": "setMode", "mode": "acceptEdits", "destination": "session" }],
    "displayName": "Write",
    "description": "spike.txt",
    "toolUseID": "toolu_01M5…",
    "requestId": "a75bd7df-…"
  }
}
```

### `user` tool result after approve

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_01M5…",
        "type": "tool_result",
        "content": "File created successfully at: /tmp/spike-test/spike.txt …"
      }
    ]
  },
  "parent_tool_use_id": null,
  "session_id": "f6df48ed-…",
  "tool_use_result": {
    "type": "create",
    "filePath": "/tmp/spike-test/spike.txt",
    "content": "hello\n",
    "structuredPatch": [],
    "originalFile": null,
    "userModified": false
  },
  "tool_result_meta": [
    { "id": "toolu_01M5…", "permission_decision": { "decision": "accept", "source": "user_temporary" } }
  ]
}
```

### `user` tool result after deny

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "content": "The user denied this action.",
        "is_error": true,
        "tool_use_id": "toolu_01AY…"
      }
    ]
  },
  "session_id": "2a02fde7-…",
  "tool_use_result": "Error: The user denied this action.",
  "tool_result_meta": [
    {
      "id": "toolu_01AY…",
      "non_execution_kind": "permission-rule",
      "permission_decision": { "decision": "reject", "source": "user_reject" }
    }
  ]
}
```

The agent's reply after the deny: *"I didn't create `spike.txt`, because the write was denied. If you'd like me to try again, approve the write when it comes up. Or you can make the file yourself with `echo hello > spike.txt`."*

### `result` after a successful turn

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "result": "I created `spike.txt` in the current directory. It contains the word `hello`, followed by a newline.",
  "session_id": "f6df48ed-…",
  "num_turns": 2,
  "result_index": 0,
  "stop_reason": "end_turn",
  "terminal_reason": "completed",
  "duration_ms": 4629,
  "total_cost_usd": 0.0581984,
  "permission_denials": [],
  "modelUsage": {
    "claude-haiku-5-5": { "inputTokens": 1186, "outputTokens": 18, "costUSD": 0.0001276, "costBasis": "list", "…": "…" },
    "claude-opus-5-5": { "inputTokens": 4, "outputTokens": 179, "costUSD": 0.0580708, "costBasis": "list", "…": "…" }
  },
  "…": "…"
}
```

After the deny, the same message has `"permission_denials": [{ "tool_name": "Write", "tool_use_id": "toolu_01AY…", "tool_input": { "file_path": "/tmp/spike-test/spike.txt", "content": "hello\n" } }]`.

### `system/api_retry` (garbage token)

```json
{
  "type": "system",
  "subtype": "api_retry",
  "attempt": 1,
  "max_retries": 10,
  "retry_delay_ms": 526,
  "error_status": 401,
  "error": "authentication_failed",
  "session_id": "072cabc5-…"
}
```

### Synthetic `assistant` error message (garbage token)

```json
{
  "type": "assistant",
  "message": {
    "id": "6bb3620d-…",
    "model": "<synthetic>",
    "role": "assistant",
    "stop_reason": "stop_sequence",
    "content": [{ "type": "text", "text": "Failed to authenticate. API Error: 401 Invalid bearer token" }],
    "usage": { "input_tokens": 0, "output_tokens": 0, "…": "…" }
  },
  "parent_tool_use_id": null,
  "session_id": "072cabc5-…",
  "error": "authentication_failed",
  "is_api_error_message": true,
  "api_error_status": 401,
  "api_error_origin": "first_party"
}
```

### `result` with `is_error` (garbage token)

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": true,
  "result": "Failed to authenticate. API Error: 401 Invalid bearer token",
  "api_error_status": 401,
  "api_error_origin": "first_party",
  "stop_reason": "stop_sequence",
  "terminal_reason": "api_error",
  "session_id": "072cabc5-…",
  "num_turns": 1,
  "result_index": 0,
  "total_cost_usd": 0,
  "modelUsage": {},
  "permission_denials": [],
  "…": "…"
}
```

### What `query()` throws (after the input ends)

```
Error: Claude Code returned an error result: Failed to authenticate. API Error: 401 Invalid bearer token
    at xy.readMessages (…/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs:…)
  telemetryMessage: 'Claude Code returned an error result',
  errorClass: 'error_result'
```
