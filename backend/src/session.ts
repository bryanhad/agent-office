// The agent session: one streaming-input query() per open project, with the options
// from decision 009 (agent-options.ts). Feeds my messages in, one turn at a time (a
// message sent while the agent is busy waits in the chat's queue), applies the mapped SDK
// output to the chat and agent state, handles Stop, and survives both error paths
// without stopping the backend. The session id and the chat are saved per project
// (saved.ts), so opening a project resumes where it left off; New chat starts over.

import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { getSessionInfo, query, type Options, type Query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { NoticeEvent } from "@agent-office/shared";
import { agentOptions } from "./agent-options.ts";
import {
  addChat,
  agentState,
  chatLog,
  onServerEvent,
  queuedMessages,
  resetChat,
  restoreChat,
  setAgentState,
  setMessageStatus,
} from "./chat.ts";
import { MessageQueue } from "./message-queue.ts";
import { cancelAll, createCanUseTool, hasPending } from "./permissions.ts";
import { archiveSaved, flushSave, loadSaved, saveSoon } from "./saved.ts";
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
  // Started with `resume`, so its first turn may be refused.
  resumed: boolean;
}

interface Session {
  dir: string;
  // `dir` and its realpath, for project-relative tool labels.
  dirs: string[];
  // The SDK's session id: saved, so a restart can resume it, and used to resume after a
  // query error.
  sessionId?: string;
  // Unset after the query threw; the next message starts a new one.
  run?: Run;
}

let session: Session | null = null;
// Set while New chat runs, so a second click from another window is ignored.
let resetting = false;

// Every chat change is saved; agent state isn't, since a restart always comes back idle.
onServerEvent((event) => {
  if (session && event.type !== "agent_state") persist(session);
});

function persist(s: Session): void {
  saveSoon(s.dir, () => ({ ...(s.sessionId && { sessionId: s.sessionId }), chat: chatLog() }));
}

function resumeFailedNotice(extra = ""): NoticeEvent {
  const text = `The previous session couldn't be resumed, so this is a fresh session. The agent doesn't remember the chat above.${extra}`;
  return { type: "notice", id: randomUUID(), text };
}

// Read, Glob, Grep and read-only commands never reach canUseTool: permissionMode
// "default" allows them without asking.
function options(s: Session, abort: AbortController): Options {
  return { ...agentOptions(s.dir, abort, createCanUseTool(s.dirs)), ...(s.sessionId && { resume: s.sessionId }) };
}

function start(s: Session): Run {
  if (s.sessionId) console.log(`resuming agent session ${s.sessionId}`);
  const input = new MessageQueue<SDKUserMessage>();
  const abort = new AbortController();
  const run: Run = {
    query: query({ prompt: input, options: options(s, abort) }),
    input,
    abort,
    done: Promise.resolve(),
    stopping: false,
    resumed: s.sessionId !== undefined,
  };
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
      // A resume the CLI refuses (e.g. its session file is gone) doesn't throw: the first
      // turn ends in an error_during_execution result, with no system/init before it
      // ("No conversation found with session ID: …"). An auth error is subtype "success"
      // (finding 3), so it isn't caught here.
      if (run.resumed && !loggedInit && msg.type === "result" && msg.subtype === "error_during_execution") {
        resumeFailed(s, run);
        break;
      }
      if ("session_id" in msg && msg.session_id && msg.session_id !== s.sessionId) {
        s.sessionId = msg.session_id;
        persist(s);
      }
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

// The saved session id got past the check in restore() but the CLI refused it anyway.
// Forget it, so the next message starts fresh instead of failing the same way again.
function resumeFailed(s: Session, run: Run): void {
  console.warn(`warning: the CLI refused to resume agent session ${s.sessionId}; the next message starts a fresh one`);
  s.sessionId = undefined;
  s.run = undefined;
  run.abort.abort();
  run.input.end();
  addChat(resumeFailedNotice(" Your last message didn't reach it, so send it again."));
  if (queuedMessages().length === 0) setAgentState("idle");
  deliverNext(s);
}

// Stop the running query and wait until it has. Pending requests are cancelled first,
// so their permission_resolved lands before the chat is reset, and the save is taken
// before the chat is reset too.
async function close(): Promise<void> {
  if (!session) return;
  cancelAll();
  const run = session.run;
  session = null;
  const saving = flushSave();
  if (run) {
    run.abort.abort();
    run.input.end();
    await run.done;
    console.log("stopped the previous agent session");
  }
  await saving;
}

// Bring back the saved chat, and the session id if the SDK still has that session.
// getSessionInfo reads only the local session file and returns undefined when it's
// missing (or the id isn't a session at all), so a bad id is caught before any query.
async function restore(s: Session): Promise<void> {
  const saved = await loadSaved(s.dir);
  if (!saved) return;
  const log = [...saved.chat];
  if (saved.sessionId !== undefined) {
    const info = await getSessionInfo(saved.sessionId, { dir: s.dir }).catch(() => undefined);
    if (info) {
      s.sessionId = saved.sessionId;
    } else {
      console.warn(`warning: saved agent session ${saved.sessionId} wasn't found; starting a fresh one`);
      log.push(resumeFailedNotice());
    }
  }
  restoreChat(log);
  console.log(`restored ${log.length} chat events for ${s.dir}`);
}

// Called whenever a project opens, and by New chat with `fresh`. The query starts now and
// waits for the first message.
export async function openSession(dir: string, { fresh = false } = {}): Promise<void> {
  await close();
  resetChat();
  // If realpath fails, labels for paths reported through a symlink may start with "../".
  const dirs = [dir, await realpath(dir).catch(() => dir)];
  const s: Session = { dir, dirs };
  if (!fresh) await restore(s);
  session = s;
  s.run = start(s);
  // Writes the restore's fix-ups, or the new empty chat.
  persist(s);
}

// New chat: archive the saved chat, then open the same project with no resume. Only from a
// resting state, so nothing in flight is lost. Returns whether it happened, so the caller
// knows to send everyone the new snapshot.
export async function newChat(): Promise<boolean> {
  const s = session;
  if (!s || resetting || s.run?.stopping || isBusy() || queuedMessages().length > 0 || hasPending()) {
    console.log("ignored new_chat: no project is open, or the agent is busy, stopping or already starting a new chat, or something is queued or pending");
    return false;
  }
  resetting = true;
  try {
    await close();
    await archiveSaved(s.dir);
    await openSession(s.dir, { fresh: true });
    console.log("started a new chat");
    return true;
  } finally {
    resetting = false;
  }
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
