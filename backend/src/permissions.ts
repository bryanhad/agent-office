// The approve/deny flow behind canUseTool. Each request waits in `pending` until my
// answer, the timeout, or the SDK's abort signal settles it, whichever comes first.
// The map isn't tied to any socket, so a request survives a reload: the snapshot
// replays its permission_request and a later permission_response still finds it.

import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionResolvedEvent } from "@agent-office/shared";
import { addChat, setAgentState } from "./chat.ts";
import { config } from "./env.ts";
import { FILE_TOOLS, toolActivity, toolLabel } from "./sdk-mapping.ts";

type Decision = PermissionResolvedEvent["decision"];

interface Pending {
  // Ends the waiting canUseTool call. The only reference to its promise is this function.
  settle: (decision: Decision) => void;
}

// What the agent reads in the tool result; it repeats it to me.
const DENY_MESSAGES: Record<Exclude<Decision, "approved">, string> = {
  denied: "The user denied this action.",
  timed_out: "The user didn't answer in time.",
  cancelled: "The request was cancelled.",
};

// Keyed by options.requestId. More than one at a time when the agent calls tools in parallel.
const pending = new Map<string, Pending>();

export function hasPending(): boolean {
  return pending.size > 0;
}

// `dirs` as in paths.ts, for project-relative labels.
export function createCanUseTool(dirs: string[]): CanUseTool {
  return (toolName, input, { signal, requestId, toolUseID, description }) => {
    const { label, full, outsideProject } = toolLabel(toolName, input, dirs);
    addChat({
      type: "permission_request",
      id: requestId,
      toolUseId: toolUseID,
      tool: toolName,
      // options.description is the SDK's ready-made label, but for a file outside the
      // project it can be a "../" chain, so file tools use our own.
      label: FILE_TOOLS.has(toolName) ? label : (description ?? label),
      detail: full,
      ...(outsideProject && { outsideProject }),
    });
    setAgentState("waiting");
    console.log(`permission ${requestId}: ${toolName} waiting for an answer`);

    return new Promise<PermissionResult>((resolve) => {
      const timer = setTimeout(() => settle("timed_out"), config.permissionTimeoutMs);
      const onAbort = () => settle("cancelled");

      // Runs once: the first of answer, timeout and abort wins, the rest find no entry.
      // Everything happens synchronously here, so the permission_resolved is in the
      // chat before a project switch resets it.
      function settle(decision: Decision): void {
        if (!pending.delete(requestId)) return;
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        console.log(`permission ${requestId}: ${toolName} ${decision}`);
        addChat({ type: "permission_resolved", id: requestId, decision });

        // Parallel requests: stay waiting until the last one is answered. A cancelled
        // request leaves the state to whoever cancelled it (project switch, query error).
        if (pending.size === 0 && decision !== "cancelled") {
          if (decision === "approved") setAgentState("working", toolActivity(toolName, label));
          else setAgentState("thinking");
        }

        // No updatedPermissions: options.suggestions is never applied, since it offers
        // switching to acceptEdits (finding 13). updatedInput is the input unchanged;
        // Claude Code before v2.1.207 rejected an allow without it.
        resolve(
          decision === "approved"
            ? { behavior: "allow", updatedInput: input }
            : { behavior: "deny", message: DENY_MESSAGES[decision] },
        );
      }

      pending.set(requestId, { settle });
      if (signal.aborted) settle("cancelled");
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  };
}

// My answer from the browser. Two windows can both click, so a second answer, or one
// for a request that already timed out, finds nothing and is only logged.
export function respond(id: string, decision: "approve" | "deny"): void {
  const request = pending.get(id);
  if (!request) {
    console.log(`ignored permission_response (${decision}) for unknown or resolved request ${id}`);
    return;
  }
  request.settle(decision === "approve" ? "approved" : "denied");
}

// Settle every pending request as cancelled, e.g. before a project switch or after the
// query threw. The SDK's abort signal would do it too, but only once it fires.
export function cancelAll(): void {
  for (const request of [...pending.values()]) request.settle("cancelled");
}
