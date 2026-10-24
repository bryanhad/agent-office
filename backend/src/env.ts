// Loads backend config and cleans the environment.
// This runs as a side effect on import, and index.ts imports it first, so it
// finishes before any other module (including the Agent SDK) is evaluated.

import path from "node:path";

// These outrank CLAUDE_CODE_OAUTH_TOKEN and would switch billing away from the subscription.
const STRIPPED_VARS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
];

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

// Unset or empty means "not configured".
function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function port(name: string, fallback: number): number {
  const raw = optional(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    fail(`${name} must be a port number between 1 and 65535, got "${raw}".`);
  }
  return value;
}

// Checked before loading .env, so we can tell where the token came from.
const tokenFromShell = Boolean(optional("CLAUDE_CODE_OAUTH_TOKEN"));

// Variables already set in the shell win over .env, so `PORT=3002 npm run dev` works.
try {
  process.loadEnvFile(path.join(import.meta.dirname, "..", ".env"));
} catch (error) {
  // A missing .env is fine here; the token check below reports what's missing.
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

if (!optional("CLAUDE_CODE_OAUTH_TOKEN")) {
  fail(
    "CLAUDE_CODE_OAUTH_TOKEN is not set. Run `claude setup-token` and put the token in backend/.env " +
      "(see backend/.env.example).",
  );
}

for (const name of STRIPPED_VARS) {
  if (name in process.env) {
    console.warn(`warning: removed ${name} from the environment so the session uses CLAUDE_CODE_OAUTH_TOKEN`);
    delete process.env[name];
  }
}

export const config = {
  // Where the token came from, for the startup log. Never the value.
  tokenSource: tokenFromShell ? "shell environment (overrides backend/.env)" : "backend/.env",
  port: port("PORT", 3001),
  webPort: port("WEB_PORT", 5173),
  // Validated when the server starts (step 5); only read here.
  projectDir: optional("PROJECT_DIR"),
  // Unset means the account's default model.
  model: optional("MODEL"),
};
