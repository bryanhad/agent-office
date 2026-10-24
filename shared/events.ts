// Messages between the backend and the browser. Types only: import with `import type`.
// Each event's comment says which SDK message(s) it comes from; the samples and
// findings it relies on are in docs/notes/sdk-events-sample.md.
//
// Paths in events are relative to the project folder, never absolute.
// No cost, model or usage fields: the SDK's cost figures are list prices, not
// billing, and the usage bar is a roadmap item.

// ---------- Agents and project ----------

export type AgentState = "idle" | "thinking" | "working" | "waiting" | "error";

// The MVP has one agent. More ids arrive with the multi-agent phase.
export type AgentId = "manager";

export interface Agent {
  id: AgentId;
  role: string;
  state: AgentState;
  // Short text for the bubble while working, e.g. "editing App.tsx".
  activity?: string;
}

export interface Project {
  // From package.json `name`, falling back to the folder name.
  name: string;
}

// Which PROJECT_DIR case applies, plus the open project if there is one.
export type ProjectStatus =
  // PROJECT_DIR not set: the start screen picks the project.
  | { config: "none"; project: Project | null }
  // PROJECT_DIR set and valid: opened on startup, no switching.
  | { config: "pinned"; project: Project }
  // PROJECT_DIR set but invalid: the start screen shows `configError` and still works.
  | { config: "invalid"; configError: string; project: Project | null };

// ---------- Server → browser (WebSocket) ----------

// Echo of a message I sent, so the chat log (and the snapshot) has both sides.
// Source: the client's `user_message`, not the SDK.
export interface UserMessageEvent {
  type: "user_message";
  id: string;
  text: string;
}

// A piece of streamed assistant text. Append `delta` to the item with this `id`.
// Source: `stream_event` with `content_block_delta` / `text_delta` only. The complete
// `assistant` text message that follows repeats the same text and is ignored.
export interface AssistantTextEvent {
  type: "assistant_text";
  // One per text block, so a reply split by a tool call becomes separate items.
  id: string;
  delta: string;
}

// One compact tool line, e.g. tool "Read", label "src/App.tsx".
// Source: a `tool_use` block in a complete `assistant` message (not the
// `input_json_delta` stream). The label is built from the input: a project-relative
// path for file tools, the command for Bash, the pattern for Glob/Grep.
export interface ToolUseEvent {
  type: "tool_use";
  // The SDK's tool_use id. A permission request for this call has the same `toolUseId`.
  id: string;
  tool: string;
  label: string;
}

// The agent wants approval. Shown as a card until a `permission_resolved` with the same id.
// Source: the `canUseTool` callback (not an SDK message): `toolName`, `input`,
// `options.requestId`, `options.toolUseID`, `options.description`.
export interface PermissionRequestEvent {
  type: "permission_request";
  // options.requestId; also the key of the backend's pending-request map.
  id: string;
  toolUseId: string;
  tool: string;
  // Short label: options.description when present (e.g. "spike.txt"), else built from the input.
  label: string;
  // What the card shows in its box: the project-relative path, or the full Bash command.
  detail: string;
}

// The outcome of a permission request.
// Source: the backend's own decision (my answer, the 10-minute timeout, or the query
// being aborted), sent when it returns from `canUseTool`.
export interface PermissionResolvedEvent {
  type: "permission_resolved";
  id: string;
  // "cancelled": the query was aborted while waiting (e.g. another project was opened).
  decision: "approved" | "denied" | "timed_out" | "cancelled";
}

// An agent's state changed. The backend derives it; the renderer only displays it.
// Source: derived by the backend from the stream (thinking/text blocks → thinking,
// tool_use → working, canUseTool → waiting, `result` → idle, errors → error).
// `system/init` is ignored here: it arrives every turn, not once per session.
export interface AgentStateEvent {
  type: "agent_state";
  agent: Agent;
}

// Something failed. One per failure, shown in the chat.
// Source: a `result` with `is_error: true` (its `subtype` can still be "success"; the text
// is `result`), or the `for await` over `query()` throwing. The synthetic `assistant`
// message (`model: "<synthetic>"`, `is_api_error_message: true`) carries the same text
// just before that result, so it is dropped rather than shown as a reply or a second error.
export interface ErrorEvent {
  type: "error";
  id: string;
  message: string;
}

// Events that make up the chat. The backend keeps them in memory, in order, and
// replays them in the snapshot. Consecutive deltas with the same id may be merged.
export type ChatEvent =
  | UserMessageEvent
  | AssistantTextEvent
  | ToolUseEvent
  | PermissionRequestEvent
  | PermissionResolvedEvent
  | ErrorEvent;

// Sent on every WebSocket connect, so a reload restores everything.
// A pending request is a `permission_request` in `chat` with no matching
// `permission_resolved`; the card reappears from the replay.
// Source: backend state, not the SDK.
export interface SnapshotEvent {
  type: "snapshot";
  project: ProjectStatus;
  agents: Agent[];
  chat: ChatEvent[];
}

export type ServerEvent = SnapshotEvent | AgentStateEvent | ChatEvent;

// ---------- Browser → server (WebSocket) ----------
//
// These are types only and prove nothing at runtime. The backend must validate every
// incoming WebSocket message against its own zod schema (in the backend, not here) and
// drop anything that doesn't match, with a log line. This socket can approve shell commands.

// A chat message for the agent. Becomes an SDKUserMessage pushed into the query.
// The server echoes it back as `user_message`.
export interface SendMessageEvent {
  type: "send_message";
  text: string;
}

// My answer to a permission card. Resolves the pending `canUseTool` call with this id.
export interface PermissionResponseEvent {
  type: "permission_response";
  id: string;
  decision: "approve" | "deny";
}

export type ClientEvent = SendMessageEvent | PermissionResponseEvent;

// ---------- HTTP ----------

// POST /api/project body. `path` may start with `~`; the backend expands and resolves it.
export interface OpenProjectRequest {
  path: string;
}

// GET /api/project and a successful POST /api/project answer with ProjectStatus.
export type ProjectResponse = ProjectStatus;

// Any failed request (400 invalid path, 403 bad Origin, 409 pinned instance).
export interface ApiError {
  error: string;
}
