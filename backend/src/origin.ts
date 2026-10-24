// Only the app's own frontend may change state. Binding to 127.0.0.1 doesn't stop a web
// page open in my browser from sending requests or opening a WebSocket to this server,
// but the browser always tells us that page's origin in the Origin header.

import type { RequestHandler } from "express";
import type { ApiError } from "@agent-office/shared";
import { config } from "./env.ts";

const ALLOWED = new Set([`http://127.0.0.1:${config.webPort}`, `http://localhost:${config.webPort}`]);

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
