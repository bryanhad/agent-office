// WebSocket at /ws on the same HTTP server: snapshot on connect, broadcasts, and
// validated client messages.

import type { Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { z } from "zod";
import type { ClientEvent, ServerEvent, SnapshotEvent } from "@agent-office/shared";
import { agents, chatLog, onServerEvent } from "./chat.ts";
import { isAllowedHost, isAllowedOrigin } from "./origin.ts";
import { projectStatus } from "./project.ts";
import { respond } from "./permissions.ts";
import { cancelMessage, newChat, sendMessage, stop } from "./session.ts";

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
  z.strictObject({
    type: z.literal("cancel_message"),
    id: z.string().min(1).max(200),
  }),
  z.strictObject({ type: z.literal("stop") }),
  z.strictObject({ type: z.literal("new_chat") }),
]);

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

// The chat replay includes any unresolved permission_request, which is the pending one.
function snapshot(): SnapshotEvent {
  return { type: "snapshot", project: projectStatus(), agents: agents(), chat: chatLog() };
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
  switch (event.type) {
    case "send_message":
      return sendMessage(event.text);
    case "permission_response":
      return respond(event.id, event.decision);
    case "cancel_message":
      return cancelMessage(event.id);
    case "stop":
      // stop() catches its own errors.
      void stop();
      return;
    case "new_chat":
      // Every window switches to the empty chat, as after opening a project.
      void newChat().then((reset) => reset && broadcastSnapshot());
  }
}

export function attachWebSocket(server: Server): void {
  // Everything the session adds to the chat or changes in agent state goes to every window.
  onServerEvent(broadcast);

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://placeholder");
    if (pathname !== "/ws") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    if (!isAllowedHost(req.headers.host)) {
      console.warn(`warning: refused WebSocket for host ${req.headers.host ?? "(none)"}`);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
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
