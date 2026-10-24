// The agent session: one streaming-input query() per open project, with the options
// from decision 009 (agent-options.ts). Feeds my messages in, applies the mapped SDK
// output to the chat and agent state, and survives both error paths without stopping
// the backend.

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { query, type CanUseTool, type Options, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { agentOptions } from "./agent-options.ts";
import { addChat, resetChat, setAgentState, unresolvedRequests } from "./chat.ts";
import { MessageQueue } from "./message-queue.ts";
import { createMapper } from "./sdk-mapping.ts";

// One running query() and the things needed to feed and stop it.
interface Run {
  query: Query;
  input: MessageQueue<SDKUserMessage>;
  abort: AbortController;
  // Settles when the query has stopped; never rejects.
  done: Promise<void>;
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

// Placeholder until step 8 adds the approve/deny cards. Read, Glob, Grep and read-only
// commands never get here: permissionMode "default" allows them without asking.
const denyEverything: CanUseTool = async (toolName) => {
  console.log(`denied ${toolName}: approval UI not wired yet`);
  return { behavior: "deny", message: "approval UI not wired yet" };
};

function options(s: Session, abort: AbortController): Options {
  return { ...agentOptions(s.dir, abort, denyEverything), ...(s.sessionId && { resume: s.sessionId }) };
}

function start(s: Session): Run {
  if (s.sessionId) console.log(`resuming agent session ${s.sessionId}`);
  const input = new MessageQueue<SDKUserMessage>();
  const abort = new AbortController();
  const run: Run = { query: query({ prompt: input, options: options(s, abort) }), input, abort, done: Promise.resolve() };
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
      for (const out of map(msg)) {
        if (out.kind === "chat") addChat(out.event);
        else setAgentState(out.state, out.activity);
      }
    }
  } catch (error) {
    // Query error (decision 009): the loop threw, e.g. the Claude Code process died.
    if (!isCurrent()) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: agent query stopped: ${message}`);
    addChat({ type: "error", id: randomUUID(), message });
    setAgentState("error");
  } finally {
    if (isCurrent()) s.run = undefined;
  }
}

// Stop the running query and wait until it has. Pending requests are reported as
// cancelled first; step 8's handler also denies them when the SDK aborts its signal.
async function close(): Promise<void> {
  if (!session) return;
  for (const id of unresolvedRequests()) addChat({ type: "permission_resolved", id, decision: "cancelled" });
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

export function sendMessage(text: string): void {
  addChat({ type: "user_message", id: randomUUID(), text });
  if (!session) {
    addChat({ type: "error", id: randomUUID(), message: "Open a project before sending a message." });
    return;
  }
  // Also the way out of `error`: the next message starts a new turn.
  setAgentState("thinking");
  session.run ??= start(session);
  session.run.input.push({
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Typed by me in the browser; the SDK treats a message without an origin as unattributed.
    origin: { kind: "human" },
  });
}
