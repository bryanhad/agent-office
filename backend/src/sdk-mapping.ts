// Turns SDK messages into shared events and agent state changes. The rules are the
// comments in shared/events.ts; the evidence is docs/notes/sdk-events-sample.md.
// Pure apart from remembering which streamed message it is in; session.ts applies the output.

import { randomUUID } from "node:crypto";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentState, ChatEvent } from "@agent-office/shared";
import { displayPath } from "./paths.ts";

export type Output = { kind: "chat"; event: ChatEvent } | { kind: "state"; state: AgentState; activity?: string };

// The SDK's stand-in reply for an API error (finding 4). Its text repeats in the result.
const SYNTHETIC_MODEL = "<synthetic>";

export const FILE_TOOLS = new Set(["Read", "Edit", "Write"]);

const VERBS: Record<string, string> = {
  Read: "reading",
  Edit: "editing",
  Write: "writing",
  Glob: "searching",
  Grep: "searching",
  Bash: "running",
};

const MAX_ACTIVITY = 40;
const MAX_LABEL = 80;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const chat = (event: ChatEvent): Output => ({ kind: "chat", event });
const state = (state: AgentState, activity?: string): Output => ({ kind: "state", state, activity });

// The path for file tools (see paths.ts), the command for Bash, the pattern for Glob/Grep.
// `label` is one short line for tool lines; `full` is the whole value, for the permission
// card, where I review the exact command before approving.
export function toolLabel(
  tool: string,
  input: Record<string, unknown>,
  dirs: string[],
): { label: string; full: string; outsideProject?: true } {
  const field = FILE_TOOLS.has(tool) ? "file_path" : tool === "Bash" ? "command" : "pattern";
  const value = input[field];
  if (typeof value !== "string") return { label: tool, full: tool };
  if (field !== "file_path") return { label: firstLine(value), full: value };
  const shown = displayPath(value, dirs);
  const label = { label: shown.path, full: shown.path };
  return shown.outsideProject ? { ...label, outsideProject: true } : label;
}

// One line for a command or pattern; "…" marks dropped lines or characters.
function firstLine(value: string): string {
  const [first, ...rest] = value.trim().split("\n");
  return rest.length > 0 ? `${truncate(first, MAX_LABEL - 2)} …` : truncate(first, MAX_LABEL);
}

// The program a command runs: its first word after any VAR=value, as a basename.
function program(command: string): string {
  const word = command.trim().split(/\s+/).find((token) => !/^\w+=/.test(token));
  return word ? path.basename(word) : command;
}

// Bubble text, e.g. "editing App.tsx" or "running python3".
export function toolActivity(tool: string, label: string): string {
  const subject = FILE_TOOLS.has(tool) ? path.basename(label) : tool === "Bash" ? program(label) : label;
  return truncate(`${VERBS[tool] ?? "using"} ${subject}`, MAX_ACTIVITY);
}

// `dirs` is the project folder as opened plus its realpath (see paths.ts).
export function createMapper(dirs: string[]): (msg: SDKMessage) => Output[] {
  // Text block ids are "<message id>:<block index>", unique across the whole chat.
  let messageId = "";

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
          const { label, outsideProject } = toolLabel(block.name, input, dirs);
          return [
            chat({ type: "tool_use", id: block.id, tool: block.name, label, ...(outsideProject && { outsideProject }) }),
            state("working", toolActivity(block.name, label)),
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
