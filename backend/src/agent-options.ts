// The fixed query() options from decision 009, shared by the session and by
// spike/write-probe.ts, so the probe checks exactly what the app runs with.

import type { CanUseTool, Options } from "@anthropic-ai/claude-agent-sdk";
import { config } from "./env.ts";

// Fixed, because the default list changes with the account and Claude Code version.
const TOOLS = ["Read", "Glob", "Grep", "Edit", "Write", "Bash"];

export function agentOptions(cwd: string, abortController: AbortController, canUseTool: CanUseTool): Options {
  return {
    cwd,
    abortController,
    settingSources: ["project"],
    permissionMode: "default",
    systemPrompt: { type: "preset", preset: "claude_code" },
    tools: TOOLS,
    // No allowedTools: it auto-approves tools past the approve/deny cards.
    disallowedTools: ["AskUserQuestion"],
    includePartialMessages: true,
    // Auto-memory off, so the agent doesn't write memories on its own; the variable is a
    // second switch. Claude Code still auto-approves writes into the memory folder even
    // then (finding 21), so the ask rule sends every write under ~/.claude to canUseTool.
    // It covers all of ~/.claude in case a later version auto-approves another folder.
    // Flag settings outrank the project's .claude/settings.json. `env` replaces the
    // environment, so the one env.ts already cleaned is spread in.
    settings: { autoMemoryEnabled: false, permissions: { ask: ["Edit(~/.claude/**)"] } },
    env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" },
    canUseTool,
    ...(config.model && { model: config.model }),
  };
}
