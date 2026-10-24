// WebSocket at /ws on the same HTTP server: snapshot on connect, broadcasts, and
// validated client messages.

import type { Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { z } from "zod";
import type { Agent, ClientEvent, ServerEvent, SnapshotEvent } from "@agent-office/shared";
import { isAllowedOrigin } from "./origin.ts";
import { projectStatus } from "./project.ts";

// Big enough for a long pasted message, small enough that nobody can make us buffer much.
// ws closes the connection on a larger frame.
const MAX_MESSAGE_BYTES = 64 * 1024;

// ClientEvent is only a type, so every incoming message is checked against this at runtime.
// The annotation makes the compiler fail if the schema and the shared type drift apart.
const clientEventSchema: z.ZodType<ClientEvent> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("send_message"),
    text: z.string().refine((text) => text.trim().length > 0, "is empty"),
  }),
  z.strictObject({
    type: z.literal("permission_response"),
    id: z.string().min(1).max(200),
    decision: z.enum(["approve", "deny"]),
  }),
]);

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

// No session yet (step 7): the manager is always idle and the chat is empty.
const agents: Agent[] = [{ id: "manager", role: "Manager", state: "idle" }];

function snapshot(): SnapshotEvent {
  return { type: "snapshot", project: projectStatus(), agents, chat: [] };
}

function send(client: WebSocket, event: ServerEvent): void {
  client.send(JSON.stringify(event));
}

export function broadcast(event: ServerEvent): void {
  for (const client of wss.clients) send(client, event);
}

export function broadcastSnapshot(): void {
  broadcast(snapshot());
}

// Log why a message was dropped: its type if it has one, and what's wrong. Never the payload.
function drop(reason: string, type?: unknown): void {
  const label = typeof type === "string" ? `"${type.slice(0, 40)}"` : "(no type)";
  console.warn(`warning: dropped WebSocket message ${label}: ${reason}`);
}

function parse(data: RawData, isBinary: boolean): ClientEvent | null {
  if (isBinary) {
    drop("binary frame");
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(data.toString());
  } catch {
    drop("not valid JSON");
    return null;
  }

  const result = clientEventSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "message"}: ${issue.message}`);
    drop(issues.join("; "), (json as { type?: unknown } | null)?.type);
    return null;
  }
  return result.data;
}

function handle(event: ClientEvent): void {
  // Validated but not acted on until the session exists (steps 7 and 8).
  if (event.type === "send_message") {
    console.log(`received send_message (${event.text.length} chars); no session yet, ignoring`);
  } else {
    console.log(`received permission_response (${event.decision}); no session yet, ignoring`);
  }
}

export function attachWebSocket(server: Server): void {
  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://placeholder");
    if (pathname !== "/ws") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    // Same exact-match rule as POST /api/project; a missing Origin is refused.
    if (!isAllowedOrigin(req.headers.origin)) {
      console.warn(`warning: refused WebSocket from origin ${req.headers.origin ?? "(none)"}`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (client) => wss.emit("connection", client, req));
  });

  wss.on("connection", (client) => {
    send(client, snapshot());
    client.on("message", (data, isBinary) => {
      const event = parse(data, isBinary);
      if (event) handle(event);
    });
    // Without a listener, a socket error would crash the process. An oversized frame
    // lands here too ("Max payload size exceeded") before ws closes the connection.
    client.on("error", (error) => console.warn(`warning: WebSocket error: ${error.message}`));
  });
}
