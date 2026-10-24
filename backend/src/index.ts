// Must stay the first import, so don't let an import sorter move it. It strips the
// credential variables before any other module (including the Agent SDK) loads.
import { config } from "./env.ts";
import express from "express";
import type { ApiError, OpenProjectRequest, ProjectResponse } from "@agent-office/shared";
import { requireAllowedHost, requireAllowedOrigin } from "./origin.ts";
import { openFromConfig, openFromRequest, projectStatus } from "./project.ts";
import { flushSaveSync } from "./saved.ts";
import { attachWebSocket, broadcastSnapshot } from "./ws.ts";

const HOST = "127.0.0.1";

// Chat saves wait a moment to batch streamed text; write the last one before exiting, so a
// restart (Ctrl+C, or tsx watch reloading) doesn't lose it.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    flushSaveSync();
    process.exit(0);
  });
}

await openFromConfig(config.projectDir);

const app = express();

// Before every route, so a DNS-rebinding page can't read anything either.
app.use(requireAllowedHost);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/project", (_req, res) => {
  const body: ProjectResponse = projectStatus();
  res.json(body);
});

// Origin first, so a refused page never gets as far as body parsing.
app.post("/api/project", requireAllowedOrigin, express.json({ limit: "10kb" }), async (req, res) => {
  const { path } = (req.body ?? {}) as Partial<OpenProjectRequest>;
  if (typeof path !== "string") {
    const body: ApiError = { error: 'Send a JSON body like {"path": "~/projects/my-app"}.' };
    res.status(400).json(body);
    return;
  }

  const result = await openFromRequest(path);
  if (!result.ok) {
    const body: ApiError = { error: result.error };
    res.status(result.httpStatus).json(body);
    return;
  }
  const body: ProjectResponse = result.status;
  res.json(body);
  // Every open window switches to the new project.
  broadcastSnapshot();
});

// Answer errors as JSON instead of Express's HTML page. Malformed JSON bodies land here.
app.use(((error, _req, res, _next) => {
  const status = typeof error?.status === "number" && error.status < 500 ? error.status : 500;
  if (status === 500) console.error(error);
  const body: ApiError = { error: status === 500 ? "Something went wrong in the backend." : "Invalid request body." };
  res.status(status).json(body);
}) satisfies express.ErrorRequestHandler);

// Express 5 calls this callback on listen errors too, so check for one first.
const server = app.listen(config.port, HOST, (error?: NodeJS.ErrnoException) => {
  if (error) {
    if (error.code === "EADDRINUSE") {
      console.error(`error: port ${config.port} is already in use. Set PORT to a free port.`);
      process.exit(1);
    }
    throw error;
  }
  console.log(`agent-office backend listening on http://${HOST}:${config.port}`);
  console.log(`  token: from ${config.tokenSource}`);
  console.log(`  web port: ${config.webPort}`);
  console.log(`  model: ${config.model ?? "account default"}`);
  console.log(`  project dir: ${config.projectDir ?? "not set"}`);
});

attachWebSocket(server);
