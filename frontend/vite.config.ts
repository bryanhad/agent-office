// Dev server for the frontend. It serves on WEB_PORT and proxies /api and /ws to the
// backend on PORT, so the browser only ever talks to one origin. Both ports come from
// the same place the backend reads them: the shell first, then backend/.env.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Only these two keys are picked out of backend/.env. Loading the whole file (Vite's
// loadEnv, or process.loadEnvFile) would put the OAuth token into this process too.
function backendEnv(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(path.join(import.meta.dirname, "..", "backend", ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

const fromFile = backendEnv();

// Same rules as backend/src/env.ts: unset or empty means the default.
function port(name: "PORT" | "WEB_PORT", fallback: number): number {
  const raw = (process.env[name] || fromFile[name])?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number between 1 and 65535, got "${raw}".`);
  }
  return value;
}

const backendPort = port("PORT", 3001);
const webPort = port("WEB_PORT", 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: webPort,
    // Fail if the port is taken instead of moving to another one: the backend only
    // accepts the Origin of WEB_PORT, so a silently moved frontend would get 403s.
    strictPort: true,
    // No changeOrigin: the backend should see the Host the browser actually used
    // (127.0.0.1:WEB_PORT or localhost:WEB_PORT), so its Host check covers proxied
    // requests too. Origin is passed through unchanged either way.
    proxy: {
      "/api": { target: `http://127.0.0.1:${backendPort}` },
      "/ws": { target: `ws://127.0.0.1:${backendPort}`, ws: true },
    },
  },
});
