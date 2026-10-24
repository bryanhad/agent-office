// Only the app's own frontend may change state. Binding to 127.0.0.1 doesn't stop a web
// page open in my browser from sending requests or opening a WebSocket to this server,
// but the browser always tells us that page's origin in the Origin header.
//
// The Host check is against DNS rebinding: a page on evil.example whose name later
// resolves to 127.0.0.1 is same-origin with itself, so its Origin check would be about
// evil.example, but the Host header still says evil.example. That one also covers reads
// like GET /api/project, which have no Origin check.

import type { RequestHandler } from "express";
import type { ApiError } from "@agent-office/shared";
import { config } from "./env.ts";

const ALLOWED = new Set([`http://127.0.0.1:${config.webPort}`, `http://localhost:${config.webPort}`]);

// Direct requests (curl, wscat) arrive with the backend's own port. Through the Vite
// proxy the Host is the one the browser used, WEB_PORT: the proxy runs without
// changeOrigin, so it forwards Host (and Origin) unchanged.
const ALLOWED_HOSTS = new Set(
  [config.port, config.webPort].flatMap((port) => [`127.0.0.1:${port}`, `localhost:${port}`]),
);

export function isAllowedHost(host: string | undefined): boolean {
  return host !== undefined && ALLOWED_HOSTS.has(host.toLowerCase());
}

export const requireAllowedHost: RequestHandler = (req, res, next) => {
  if (isAllowedHost(req.headers.host)) return next();
  console.warn(`warning: refused ${req.method} ${req.path} for host ${req.headers.host ?? "(none)"}`);
  const body: ApiError = { error: "Unknown Host. Open Agent Office at 127.0.0.1 or localhost." };
  res.status(403).json(body);
};

// Exact match only. A missing Origin is refused too: browsers always send it on POST and
// WebSocket handshakes, so only non-browser clients omit it, and they can pass one.
export function isAllowedOrigin(origin: string | undefined): boolean {
  return origin !== undefined && ALLOWED.has(origin);
}

export const requireAllowedOrigin: RequestHandler = (req, res, next) => {
  if (isAllowedOrigin(req.headers.origin)) return next();
  console.warn(`warning: refused ${req.method} ${req.path} from origin ${req.headers.origin ?? "(none)"}`);
  const body: ApiError = { error: "Requests are only accepted from the Agent Office frontend." };
  res.status(403).json(body);
};
