// Write probe: checks that every file write reaches canUseTool with the app's real
// query() options. Claude Code auto-approved writes into its memory folder past
// canUseTool (sdk-events-sample.md finding 21), so run this after every SDK upgrade.
// Usage: npx tsx scripts/write-probe.ts [project-folder]   (default: a fresh temp folder)
// Exits 1 if any write skipped canUseTool, or 2 if the agent never attempted one.

import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import "../src/env.ts";
import { query, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { agentOptions } from "../src/agent-options.ts";

const FILE = "ao-write-probe.md";

const arg = process.argv[2];
const cwd = arg
  ? path.resolve(arg.replace(/^~(?=$|\/)/, os.homedir()))
  : mkdtempSync(path.join(os.tmpdir(), "ao-probe-"));

// Claude Code's folder for this project, e.g. /tmp/x → ~/.claude/projects/-private-tmp-x/.
const encoded = realpathSync(cwd).replace(/[^a-zA-Z0-9]/g, "-");
const home = os.homedir();
const targets = [
  path.join(home, ".claude", "projects", encoded, "memory", FILE),
  path.join(home, ".claude", FILE),
  path.join(home, FILE),
  path.join(cwd, FILE),
];

const existing = targets.filter((target) => existsSync(target));
if (existing.length > 0) {
  console.error(`Refusing to run: these files already exist: ${existing.join(", ")}`);
  process.exit(1);
}

type Outcome = "reached canUseTool" | "SKIPPED canUseTool" | "not attempted";

async function probe(target: string): Promise<Outcome> {
  let asked = false;
  let attempted = false;
  const denyEverything: CanUseTool = async (toolName, input) => {
    if (input.file_path === target) asked = true;
    return { behavior: "deny", message: "Denied by the write probe." };
  };
  const prompt = `Use the Write tool to create ${target} containing the word probe. Use no other tool. If it is denied, stop.`;
  const run = query({ prompt, options: agentOptions(cwd, new AbortController(), denyEverything) });
  for await (const msg of run) {
    if (msg.type !== "assistant") continue;
    for (const block of msg.message.content) {
      if (block.type === "tool_use" && (block.input as { file_path?: unknown }).file_path === target) attempted = true;
    }
  }
  // A file that exists now was written without asking; remove what the probe made.
  const written = existsSync(target);
  if (written) rmSync(target);
  if (asked && !written) return "reached canUseTool";
  if (written) return "SKIPPED canUseTool";
  return attempted ? "SKIPPED canUseTool" : "not attempted";
}

console.log(`probing writes from ${cwd}`);
const results: [string, Outcome][] = [];
for (const target of targets) {
  const outcome = await probe(target);
  console.log(`${outcome.padEnd(20)} ${target.replace(home, "~")}`);
  results.push([target, outcome]);
}
// A temp folder and the transcripts Claude Code kept for it are the probe's own.
if (!arg) for (const dir of [cwd, path.join(home, ".claude", "projects", encoded)]) rmSync(dir, { recursive: true, force: true });

if (results.some(([, outcome]) => outcome === "SKIPPED canUseTool")) process.exit(1);
if (results.some(([, outcome]) => outcome === "not attempted")) process.exit(2);
console.log("ok: every write reached canUseTool");
