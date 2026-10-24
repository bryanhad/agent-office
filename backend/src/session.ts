// The agent session: one streaming-input query() per open project, with the options
// from decision 009 (agent-options.ts). Feeds my messages in, one turn at a time (a
// message sent while the agent is busy waits in the chat's queue), applies the mapped SDK
// output to the chat and agent state, handles Stop, and survives both error paths
// without stopping the backend.

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { query, type Options, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { agentOptions } from "./agent-options.ts";
import { addChat, agentState, queuedMessages, resetChat, setAgentState, setMessageStatus } from "./chat.ts";
import { MessageQueue } from "./message-queue.ts";
import { cancelAll, createCanUseTool, hasPending } from "./permissions.ts";
import { createMapper } from "./sdk-mapping.ts";

// One running query() and the things needed to feed and stop it.
interface Run {
  query: Query;
  input: MessageQueue<SDKUserMessage>;
  abort: AbortController;
  // Settles when the query has stopped; never rejects.
  done: Promise<void>;
  // Set by Stop until the interrupted turn's result arrives.
  stopping: boolean;
}

interface Session {
  dir: string;
  // `dir` and its realpath, for project-relative tool labels.
  dirs: string[];
  // The SDK's session id, so a query that threw can be resumed with the same conversation.
  sessionId?: string;
  // Unset after the query threw; the next message starts a new one.
  run?: Run;
}

let session: Session | null = null;

// Read, Glob, Grep and read-only commands never reach canUseTool: permissionMode
// "default" allows them without asking.
function options(s: Session, abort: AbortController): Options {
  return { ...agentOptions(s.dir, abort, createCanUseTool(s.dirs)), ...(s.sessionId && { resume: s.sessionId }) };
}

function start(s: Session): Run {
  if (s.sessionId) console.log(`resuming agent session ${s.sessionId}`);
  const input = new MessageQueue<SDKUserMessage>();
  const abort = new AbortController();
  const run: Run = { query: query({ prompt: input, options: options(s, abort) }), input, abort, done: Promise.resolve(), stopping: false };
  run.done = consume(s, run);
  return run;
}

async function consume(s: Session, run: Run): Promise<void> {
  const map = createMapper(s.dirs);
  // A closed or replaced run must not touch the chat: its abort error is expected.
  const isCurrent = () => session === s && s.run === run;
  let loggedInit = false;

  try {
    for await (const msg of run.query) {
      if (!isCurrent()) break;
      if ("session_id" in msg && msg.session_id) s.sessionId = msg.session_id;
      if (msg.type === "system" && msg.subtype === "init" && !loggedInit) {
        loggedInit = true;
        console.log(`agent model: ${msg.model}`);
        console.log(`agent tools: ${msg.tools.join(", ")}`);
        // Not in the SDK's types, but sent (finding 18); should have no "auto" entry.
        const memoryPaths = (msg as { memory_paths?: unknown }).memory_paths;
        console.log(`agent memory paths: ${JSON.stringify(memoryPaths ?? {})}`);
      }
      // The interrupted turn ends with an error result (finding 23). I asked for the
      // stop, so it shows as a neutral line and the agent goes idle, not to `error`.
      if (msg.type === "result" && run.stopping) {
        run.stopping = false;
        addChat({ type: "stopped", id: randomUUID() });
        // Only messages sent after Stop can be queued here; they start the next turn.
        if (queuedMessages().length === 0) setAgentState("idle");
        deliverNext(s);
        continue;
      }
      for (const out of map(msg)) {
        if (out.kind === "chat") addChat(out.event);
        // After Stop, the turn's last messages (e.g. the rejected tool's result) would
        // move the state back to thinking; the result above sets it instead.
        else if (run.stopping) continue;
        // A queued message starts the next turn right below, so go straight to thinking
        // instead of flashing idle in between.
        else if (out.state === "idle" && queuedMessages().length > 0) continue;
        // While a request waits, it owns the state: a parallel tool_use arriving now
        // would otherwise turn `waiting` into `working`. Errors still show.
        else if (!hasPending() || out.state === "error") setAgentState(out.state, out.activity);
      }
      // A turn error ends the turn too, so the queue moves on rather than getting stuck.
      if (msg.type === "result") deliverNext(s);
    }
  } catch (error) {
    // Query error (decision 009): the loop threw, e.g. the Claude Code process died.
    if (!isCurrent()) return;
    const message = error instanceof Error ? error.message : String(error);
    cancelAll();
    console.error(`error: agent query stopped: ${message}`);
    addChat({ type: "error", id: randomUUID(), message });
    setAgentState("error");
  } finally {
    if (isCurrent()) s.run = undefined;
  }
}

// Stop the running query and wait until it has. Pending requests are cancelled first,
// so their permission_resolved lands before the chat is reset.
async function close(): Promise<void> {
  if (!session) return;
  cancelAll();
  const run = session.run;
  session = null;
  if (!run) return;
  run.abort.abort();
  run.input.end();
  await run.done;
  console.log("stopped the previous agent session");
}

// Called whenever a project opens. The query starts now and waits for the first message.
export async function openSession(dir: string): Promise<void> {
  await close();
  resetChat();
  // If realpath fails, labels for paths reported through a symlink may start with "../".
  const dirs = [dir, await realpath(dir).catch(() => dir)];
  const s: Session = { dir, dirs };
  session = s;
  s.run = start(s);
}

// `error` and `idle` aren't busy: a message sent then starts a new turn right away.
function isBusy(): boolean {
  const state = agentState();
  return state === "thinking" || state === "working" || state === "waiting";
}

export function sendMessage(text: string): void {
  const id = randomUUID();
  if (!session) {
    addChat({ type: "user_message", id, text, status: "delivered" });
    addChat({ type: "error", id: randomUUID(), message: "Open a project before sending a message." });
    return;
  }
  // Held in the chat's queue, not pushed into the SDK input, so it can still be
  // cancelled and Stop can drop it. deliverNext sends it when the turn ends.
  if (isBusy()) {
    addChat({ type: "user_message", id, text, status: "queued" });
    return;
  }
  addChat({ type: "user_message", id, text, status: "delivered" });
  deliver(session, text);
}

// Called when a turn ends: the oldest queued message, if any, starts the next one.
function deliverNext(s: Session): void {
  const next = queuedMessages()[0];
  if (next) deliver(s, setMessageStatus(next.id, "delivered")!.text);
}

function deliver(s: Session, text: string): void {
  // Also the way out of `error`: the next message starts a new turn.
  setAgentState("thinking");
  s.run ??= start(s);
  s.run.input.push({
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Typed by me in the browser; the SDK treats a message without an origin as unattributed.
    origin: { kind: "human" },
  });
}

export function cancelMessage(id: string): void {
  if (!setMessageStatus(id, "cancelled")) console.log(`ignored cancel_message for unknown or no longer queued message ${id}`);
}

// Stop everything: the queue and pending requests are cancelled first, so their events
// land before the stopped line, then the turn is interrupted. Its result ends the stop.
export async function stop(): Promise<void> {
  const run = session?.run;
  if (!run || !isBusy() || run.stopping) {
    console.log(`ignored stop: the agent is ${run?.stopping ? "already stopping" : agentState()}`);
    return;
  }
  run.stopping = true;
  for (const message of [...queuedMessages()]) setMessageStatus(message.id, "cancelled");
  cancelAll();
  console.log("stopping the current turn");
  try {
    await run.query.interrupt();
  } catch (error) {
    // No result will come to end the stop, so end it here rather than stay busy.
    console.error(`error: interrupt failed: ${error instanceof Error ? error.message : String(error)}`);
    run.stopping = false;
    setAgentState("idle");
  }
}
