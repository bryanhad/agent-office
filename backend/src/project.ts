// Project folder validation and the instance's current project.

import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Project, ProjectStatus } from "@agent-office/shared";
import { openSession } from "./session.ts";

type Problem = "empty" | "relative" | "not_found" | "not_a_folder" | "unreadable";

// Shown under the start screen's path input (wording from docs/design/layout.png).
const MESSAGES: Record<Problem, string> = {
  empty: "Enter a folder path.",
  relative: "Use a full path, or start with ~.",
  not_found: "That folder doesn't exist. Check the path and try again.",
  not_a_folder: "That path is a file, not a folder. Check the path and try again.",
  unreadable: "That folder can't be opened. Check its permissions and try again.",
};

// Shown after "The project folder set in the backend config isn't valid: ".
const REASONS: Record<Problem, string> = {
  empty: "the path is empty",
  relative: "it's a relative path; use a full path or start with ~",
  not_found: "the folder doesn't exist",
  not_a_folder: "it's a file, not a folder",
  unreadable: "the folder can't be opened",
};

interface OpenProject {
  dir: string;
  project: Project;
}

type Resolved = { ok: true; open: OpenProject } | { ok: false; problem: Problem; dir: string };

export type OpenResult =
  | { ok: true; status: ProjectStatus }
  | { ok: false; httpStatus: 400 | 409; error: string };

let current: OpenProject | null = null;
let pinned = false;
let configError: string | null = null;

// Expand `~`, require an absolute path, normalize it, check it's a readable folder.
// Relative paths are refused rather than resolved: against the backend's working
// directory they'd point somewhere surprising.
async function resolve(input: string): Promise<Resolved> {
  const trimmed = input.trim();
  const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
  if (!trimmed) return { ok: false, problem: "empty", dir: trimmed };
  if (!path.isAbsolute(expanded)) return { ok: false, problem: "relative", dir: trimmed };
  const dir = path.resolve(expanded);

  try {
    if (!(await stat(dir)).isDirectory()) return { ok: false, problem: "not_a_folder", dir };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ENOTDIR: a parent in the path is a file, so the folder can't exist either.
    const problem = code === "ENOENT" || code === "ENOTDIR" ? "not_found" : "unreadable";
    return { ok: false, problem, dir };
  }

  return { ok: true, open: { dir, project: { name: await projectName(dir) } } };
}

// package.json `name` if it's a non-empty string, else the folder name.
async function projectName(dir: string): Promise<string> {
  try {
    const { name } = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // No package.json, or not valid JSON: use the folder name.
  }
  return path.basename(dir) || dir;
}

// The session skips user and local settings but honors the project's own allow rules
// (decision 009), and those skip the approve card. Say which ones, so it's never a surprise.
async function warnAboutAllowRules(dir: string): Promise<void> {
  const file = path.join(dir, ".claude", "settings.json");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`warning: couldn't read ${file}, so its permission rules weren't checked`);
    }
    return;
  }

  let allow: unknown;
  try {
    allow = JSON.parse(text)?.permissions?.allow;
  } catch {
    console.warn(`warning: ${file} isn't valid JSON, so its permission rules weren't checked`);
    return;
  }

  if (Array.isArray(allow) && allow.length > 0) {
    const rules = allow.map((rule) => `  - ${String(rule)}`).join("\n");
    console.warn(`warning: ${file} auto-approves these without an approve card:\n${rules}`);
  }
}

async function use(open: OpenProject): Promise<void> {
  current = open;
  console.log(`opened project "${open.project.name}" at ${open.dir}`);
  await warnAboutAllowRules(open.dir);
  // Stops the previous project's agent, if any, and starts a fresh conversation here.
  await openSession(open.dir);
}

export function projectStatus(): ProjectStatus {
  const project = current?.project ?? null;
  if (pinned && current) return { config: "pinned", project: current.project };
  if (configError) return { config: "invalid", configError, project };
  return { config: "none", project };
}

// Startup: apply PROJECT_DIR. An invalid value is reported, never fatal.
export async function openFromConfig(projectDir: string | undefined): Promise<void> {
  if (projectDir === undefined) return;

  const result = await resolve(projectDir);
  if (!result.ok) {
    configError = `${result.dir} (${REASONS[result.problem]})`;
    console.warn(`warning: PROJECT_DIR isn't valid: ${configError}. Starting without a project.`);
    return;
  }

  await use(result.open);
  pinned = true;
  console.log("PROJECT_DIR is set, so this instance stays on this project.");
}

// POST /api/project.
export async function openFromRequest(input: string): Promise<OpenResult> {
  if (pinned) {
    return { ok: false, httpStatus: 409, error: "This instance is pinned to PROJECT_DIR and can't switch projects." };
  }

  const result = await resolve(input);
  if (!result.ok) return { ok: false, httpStatus: 400, error: MESSAGES[result.problem] };

  await use(result.open);
  return { ok: true, status: projectStatus() };
}
