// Turns SDK messages into shared events and agent state changes. The rules are the
// comments in shared/events.ts; the evidence is docs/notes/sdk-events-sample.md.
// Pure apart from remembering which streamed message it is in; session.ts applies the output.

import { randomUUID } from "node:crypto";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentState, ChatEvent } from "@agent-office/shared";

export type Output = { kind: "chat"; event: ChatEvent } | { kind: "state"; state: AgentState; activity?: string };

// The SDK's stand-in reply for an API error (finding 4). Its text repeats in the result.
const SYNTHETIC_MODEL = "<synthetic>";

const FILE_TOOLS = new Set(["Read", "Edit", "Write"]);

const VERBS: Record<string, string> = {
  Read: "reading",
  Edit: "editing",
  Write: "writing",
  Glob: "searching",
  Grep: "searching",
  Bash: "running",
};

const MAX_ACTIVITY = 40;

const chat = (event: ChatEvent): Output => ({ kind: "chat", event });
const state = (state: AgentState, activity?: string): Output => ({ kind: "state", state, activity });

// `dirs` is the project folder as opened plus its realpath: on macOS the agent may
// report /private/tmp/x for a project opened as /tmp/x.
export function createMapper(dirs: string[]): (msg: SDKMessage) => Output[] {
  // Text block ids are "<message id>:<block index>", unique across the whole chat.
  let messageId = "";

  function relative(file: string): string {
    if (!path.isAbsolute(file)) return file;
    for (const dir of dirs) {
      const rel = path.relative(dir, file);
      if (rel !== ".." && !rel.startsWith(`..${path.sep}`)) return rel || ".";
    }
    return path.relative(dirs[0], file);
  }

  // Project-relative path for file tools, the command for Bash, the pattern for Glob/Grep.
  function label(tool: string, input: Record<string, unknown>): string {
    const field = FILE_TOOLS.has(tool) ? "file_path" : tool === "Bash" ? "command" : "pattern";
    const value = input[field];
    if (typeof value !== "string") return tool;
    return field === "file_path" ? relative(value) : value;
  }

  // Bubble text, e.g. "editing App.tsx".
  function activity(tool: string, label: string): string {
    const subject = FILE_TOOLS.has(tool) ? path.basename(label) : label.split("\n")[0];
    const text = `${VERBS[tool] ?? "using"} ${subject}`;
    return text.length > MAX_ACTIVITY ? `${text.slice(0, MAX_ACTIVITY - 1)}…` : text;
  }

  return function map(msg: SDKMessage): Output[] {
    switch (msg.type) {
      // Streamed text is the only source of chat text (finding 9). A thinking or text
      // block starting is the thinking signal; thinking itself has no text (finding 10).
      case "stream_event": {
        const event = msg.event;
        if (event.type === "message_start") {
          messageId = event.message.id;
        } else if (event.type === "content_block_start") {
          const type = event.content_block.type;
          if (type === "thinking" || type === "redacted_thinking" || type === "text") return [state("thinking")];
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          return [chat({ type: "assistant_text", id: `${messageId}:${event.index}`, delta: event.delta.text })];
        }
        return [];
      }

      // Complete messages: only tool_use blocks matter; their text was already streamed.
      case "assistant": {
        if (msg.message.model === SYNTHETIC_MODEL) return [];
        return msg.message.content.flatMap((block) => {
          if (block.type !== "tool_use") return [];
          const input = (block.input ?? {}) as Record<string, unknown>;
          const text = label(block.name, input);
          return [
            chat({ type: "tool_use", id: block.id, tool: block.name, label: text }),
            state("working", activity(block.name, text)),
          ];
        });
      }

      // A tool result (approved, denied or auto-allowed) hands control back to the model.
      case "user": {
        const content = msg.message.content;
        const isToolResult = Array.isArray(content) && content.some((block) => block.type === "tool_result");
        return isToolResult ? [state("thinking")] : [];
      }

      // `is_error`, never `subtype`: an auth failure arrives as subtype "success" (finding 3).
      case "result": {
        if (!msg.is_error) return [state("idle")];
        const text = msg.subtype === "success" ? msg.result : msg.errors.join("; ");
        return [chat({ type: "error", id: randomUUID(), message: text || "The turn failed." }), state("error")];
      }

      // system/init (every turn, finding 7), status, retries, rate limits: not chat or state.
      default:
        return [];
    }
  };
}
