// The chat log and the SDK session id, saved per project under ~/.agent-office/ so a
// backend restart can bring both back. One JSON file per project holds both, so a single
// atomic write keeps them in step. The log holds commands, paths and file contents, so
// the folders are 0700 and the files 0600.

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ChatEvent } from "@agent-office/shared";

export interface Saved {
  sessionId?: string;
  chat: ChatEvent[];
}

const ROOT = path.join(os.homedir(), ".agent-office");
const FOLDER = path.join(ROOT, "projects");

// Streamed text changes the log many times a second; this caps the writes.
const SAVE_DELAY_MS = 300;

const id = z.string().min(1);
const outsideProject = z.literal(true).optional();

// The file is ours, but it can be truncated or hand-edited, and a malformed event would
// break the browser's replay. The annotation makes the compiler fail if this and the
// shared type drift apart.
const chatEventSchema: z.ZodType<ChatEvent> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user_message"), id, text: z.string(), status: z.enum(["queued", "delivered", "cancelled"]) }),
  z.object({ type: z.literal("assistant_text"), id, delta: z.string() }),
  z.object({ type: z.literal("tool_use"), id, tool: z.string(), label: z.string(), outsideProject }),
  z.object({
    type: z.literal("permission_request"),
    id,
    toolUseId: z.string(),
    tool: z.string(),
    label: z.string(),
    detail: z.string(),
    outsideProject,
  }),
  z.object({ type: z.literal("permission_resolved"), id, decision: z.enum(["approved", "denied", "timed_out", "cancelled"]) }),
  z.object({ type: z.literal("error"), id, message: z.string() }),
  z.object({ type: z.literal("stopped"), id }),
  z.object({ type: z.literal("notice"), id, text: z.string() }),
]);

// `sessionId` is any string: a bad one still loads the chat, and the resume check
// reports it as a session that couldn't be resumed.
const fileSchema = z.object({
  version: z.literal(1),
  // The project's absolute path, so a person can tell the files apart.
  dir: z.string(),
  sessionId: z.string().optional(),
  chat: z.array(chatEventSchema),
});

// Keyed by a hash of the absolute path: any path maps to a safe, fixed-length file name.
function baseName(dir: string): string {
  return createHash("sha256").update(dir).digest("hex").slice(0, 16);
}

function fileFor(dir: string): string {
  return path.join(FOLDER, `${baseName(dir)}.json`);
}

// For archived and set-aside files: sortable, and safe in a file name.
function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// mkdir's mode only applies to folders it creates, so chmod covers ones that already exist.
let folderReady: Promise<void> | null = null;
function ensureFolder(): Promise<void> {
  folderReady ??= (async () => {
    await mkdir(FOLDER, { recursive: true, mode: 0o700 });
    await chmod(ROOT, 0o700);
    await chmod(FOLDER, 0o700);
  })();
  return folderReady;
}

// A missing or broken file means "no saved chat". A broken one is set aside rather than
// left for the next save to overwrite. Never throws, and never logs the contents: a
// JSON.parse message quotes the text.
export async function loadSaved(dir: string): Promise<Saved | null> {
  const file = fileFor(dir);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") console.log(`no saved chat for ${dir}`);
    else console.warn(`warning: couldn't read the saved chat ${file} (${(error as NodeJS.ErrnoException).code}); starting with an empty chat`);
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    await setAside(file, "it isn't valid JSON");
    return null;
  }
  const result = fileSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    await setAside(file, `${issue.path.join(".") || "file"}: ${issue.message}`);
    return null;
  }
  const { sessionId, chat } = result.data;
  return sessionId === undefined ? { chat } : { sessionId, chat };
}

async function setAside(file: string, reason: string): Promise<void> {
  const aside = file.replace(/\.json$/, `.corrupt-${stamp()}.json`);
  try {
    await rename(file, aside);
    console.warn(`warning: the saved chat ${file} is unreadable (${reason}); moved it to ${aside} and started with an empty chat`);
  } catch (error) {
    console.warn(`warning: the saved chat ${file} is unreadable (${reason}) and couldn't be moved aside: ${errorText(error)}`);
  }
}

// ---------- Writing ----------

// The change waiting to be written. `get` is read when the write happens, so it always
// saves the latest log.
let scheduled: { dir: string; get: () => Saved; timer: NodeJS.Timeout } | null = null;
// Writes run one after another, so an older one can never land after a newer one.
let writing: Promise<void> = Promise.resolve();

function serialize(dir: string, saved: Saved): string {
  return JSON.stringify({ version: 1, dir, ...saved });
}

// Called on every chat change. The first change starts the timer; later ones ride along.
export function saveSoon(dir: string, get: () => Saved): void {
  if (scheduled?.dir === dir) {
    scheduled.get = get;
    return;
  }
  if (scheduled) void flushSave();
  scheduled = { dir, get, timer: setTimeout(() => void flushSave(), SAVE_DELAY_MS) };
}

// Write the waiting change now. The data is taken synchronously, so a caller can reset the
// chat right after calling this without the old project's file getting the new state.
export function flushSave(): Promise<void> {
  if (!scheduled) return writing;
  const { dir, get, timer } = scheduled;
  scheduled = null;
  clearTimeout(timer);
  const data = serialize(dir, get());
  writing = writing.then(() => write(fileFor(dir), data));
  return writing;
}

// Temp file, then rename: a rename within one folder is atomic, so a crash mid-write
// leaves the previous file whole. Errors are logged; the chat goes on in memory.
async function write(file: string, data: string): Promise<void> {
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await ensureFolder();
    await writeFile(temp, data, { mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    console.error(`error: couldn't save the chat to ${file}: ${errorText(error)}`);
  }
}

// For the exit signals, where nothing async gets to finish.
export function flushSaveSync(): void {
  if (!scheduled) return;
  const { dir, get, timer } = scheduled;
  scheduled = null;
  clearTimeout(timer);
  const file = fileFor(dir);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(FOLDER, { recursive: true, mode: 0o700 });
    chmodSync(ROOT, 0o700);
    chmodSync(FOLDER, 0o700);
    writeFileSync(temp, serialize(dir, get()), { mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    console.error(`error: couldn't save the chat to ${file}: ${errorText(error)}`);
  }
}

// New chat: the current file is kept under a timestamped name, so the next save starts a
// new one. Browsing archived chats is out of scope; they're only kept.
export async function archiveSaved(dir: string): Promise<void> {
  await flushSave();
  const file = fileFor(dir);
  const archived = path.join(FOLDER, `${baseName(dir)}.${stamp()}.json`);
  try {
    await rename(file, archived);
    console.log(`archived the chat for ${dir} as ${archived}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`error: couldn't archive ${file}: ${errorText(error)}`);
    }
  }
}
