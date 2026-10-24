// SDK sanity check: run one Agent SDK query and print every event it emits.
// Usage: npx tsx scripts/sdk-spike.ts <project-folder>

import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { query, type CanUseTool, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

// These outrank CLAUDE_CODE_OAUTH_TOKEN and would switch billing away from the subscription.
const STRIPPED_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

const PROMPTS = [
  "Create a file named spike.txt in the current directory containing the word hello.",
  "What file did you just try to create, and did it work?",
];

// Existing environment variables win over .env, so CLAUDE_CODE_OAUTH_TOKEN=garbage on the command line overrides it.
try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
} catch {
  // A missing .env is reported by the token check below.
}

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.error("CLAUDE_CODE_OAUTH_TOKEN is missing. Run `claude setup-token` and put it in backend/.env.");
  process.exit(1);
}

for (const name of STRIPPED_VARS) {
  if (name in process.env) {
    console.warn(`warning: removed ${name} from the environment`);
    delete process.env[name];
  }
}

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: npx tsx scripts/sdk-spike.ts <project-folder>");
  process.exit(1);
}
const cwd = path.resolve(arg.replace(/^~(?=$|\/)/, os.homedir()));

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
    // Treat a closed stdin (e.g. piped input ran out) as "no".
    rl.on("close", () => {
      if (!answered) resolve("");
    });
  });
}

const canUseTool: CanUseTool = async (toolName, input, { signal, ...options }) => {
  console.log("\n=== PERMISSION REQUEST ===");
  console.log(JSON.stringify({ toolName, input, options }, null, 2));
  const answer = await ask("Allow? (y/n): ");
  if (answer.trim().toLowerCase() === "y") {
    return { behavior: "allow", updatedInput: input };
  }
  return { behavior: "deny", message: "The user denied this action." };
};

// Streaming input: the next prompt is sent only after the previous turn's result arrives.
let finishTurn = () => {};
async function* prompts(): AsyncGenerator<SDKUserMessage> {
  for (const text of PROMPTS) {
    const turnDone = new Promise<void>((resolve) => (finishTurn = resolve));
    console.log(`\n>>> user: ${text}`);
    yield { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
    await turnDone;
  }
}

const q = query({
  prompt: prompts(),
  options: {
    cwd,
    settingSources: ["project"],
    permissionMode: "default",
    systemPrompt: { type: "preset", preset: "claude_code" },
    disallowedTools: ["AskUserQuestion"],
    includePartialMessages: true,
    canUseTool,
  },
});

try {
  for await (const msg of q) {
    if (msg.type === "stream_event") {
      const e = msg.event;
      const detail = e.type === "content_block_delta" ? ` ${e.delta.type} ${JSON.stringify(e.delta)}` : "";
      console.log(`[stream_event] ${e.type}${detail}`);
      continue;
    }

    const subtype = "subtype" in msg ? `/${msg.subtype}` : "";
    console.log(`\n[${msg.type}${subtype}]`);
    console.log(JSON.stringify(msg, null, 2));

    if (msg.type === "system" && msg.subtype === "init") {
      console.log(`\n>>> apiKeySource: ${msg.apiKeySource}  permissionMode: ${msg.permissionMode}`);
    }
    if (msg.type === "result") finishTurn();
  }
} catch (error) {
  console.error("\n>>> query threw:", error);
  process.exitCode = 1;
}
