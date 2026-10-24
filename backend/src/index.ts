// Must stay the first import: it cleans the environment before anything else loads.
import { config } from "./env.ts";
import express from "express";

const HOST = "127.0.0.1";

const app = express();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Express 5 calls this callback on listen errors too, so check for one first.
app.listen(config.port, HOST, (error?: NodeJS.ErrnoException) => {
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
