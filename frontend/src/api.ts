// HTTP calls to the backend, through the Vite proxy at /api.

import type { ApiError, OpenProjectRequest, ProjectResponse } from "@agent-office/shared";
import { useStore } from "./store.ts";

const UNREACHABLE = "Can't reach the backend. Is it running?";

// Open a project folder. The broadcast snapshot that follows switches every tab; the
// response is the same status, applied here only so this tab doesn't wait for it.
export async function openProject(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch("/api/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path } satisfies OpenProjectRequest),
    });
    body = await response.json();
  } catch {
    // Network failure, or a non-JSON answer: the Vite proxy sends one when the backend is down.
    return { ok: false, error: UNREACHABLE };
  }

  if (!response.ok) {
    const error = (body as Partial<ApiError> | null)?.error;
    return { ok: false, error: typeof error === "string" ? error : UNREACHABLE };
  }
  useStore.setState({ project: body as ProjectResponse });
  return { ok: true };
}
