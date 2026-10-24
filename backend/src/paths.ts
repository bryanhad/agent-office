// How a file path is shown in tool lines and permission cards. Paths inside the project
// are project-relative; anything else is never a "../" chain, which hides where it points.

import os from "node:os";
import path from "node:path";

export interface DisplayPath {
  path: string;
  // Set when the file is outside the project, so the UI can warn.
  outsideProject?: true;
}

// `dirs` is the project folder as opened plus its realpath: on macOS the agent may
// report /private/tmp/x for a project opened as /tmp/x.
export function displayPath(file: string, dirs: string[]): DisplayPath {
  // The agent sometimes passes "~/…" or a relative path instead of an absolute one.
  if (file === "~" || file.startsWith("~/")) file = path.join(os.homedir(), file.slice(1));
  file = path.resolve(dirs[0], file);
  for (const dir of dirs) {
    const rel = path.relative(dir, file);
    if (!isOutside(rel)) return { path: rel || "." };
  }
  const fromHome = path.relative(os.homedir(), file);
  const shown = isOutside(fromHome) ? file : path.join("~", fromHome);
  return { path: shown, outsideProject: true };
}

function isOutside(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}
