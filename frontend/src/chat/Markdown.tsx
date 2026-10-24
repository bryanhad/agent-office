// Assistant text as minimal markdown (brief §6): paragraphs, lists, inline code, code
// blocks and http(s) links. Everything else stays plain text. It builds React elements
// only, never HTML strings, so HTML in the text (which can come from files the agent
// read) shows as literal text: React escapes it.
//
// Hand-rolled rather than a markdown library: the set is tiny, and a library would need
// configuring down to it (and away from raw HTML) anyway.

import type { ReactNode } from "react";

type Block =
  | { kind: "code"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "paragraph"; text: string };

const FENCE = /^\s*```/;
const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (FENCE.test(line)) {
      // An unclosed fence (mid-stream) runs to the end, so the block doesn't flip
      // between code and paragraphs while it streams.
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = item[2] !== undefined;
      const list: Block = { kind: "list", ordered, start: ordered ? Number(item[2]) : 1, items: [] };
      while (i < lines.length) {
        const next = LIST_ITEM.exec(lines[i]);
        if (next && (next[2] !== undefined) === ordered) list.items.push(next[3]);
        // An indented line continues the item above it.
        else if (/^\s+\S/.test(lines[i]) && list.items.length > 0) list.items[list.items.length - 1] += `\n${lines[i].trim()}`;
        else break;
        i++;
      }
      blocks.push(list);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !FENCE.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
      paragraph.push(lines[i++]);
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks;
}

// `code`, or [text](http(s) url). A link with any other scheme stays plain text.
const INLINE = /`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded-[4px] bg-surface-sunken px-1 py-px font-mono text-[0.9em]">
          {match[1]}
        </code>,
      );
    } else {
      parts.push(
        <a key={match.index} href={match[3]} target="_blank" rel="noopener noreferrer" className="underline">
          {match[2]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 break-words">
      {parseBlocks(text).map((block, index) => {
        switch (block.kind) {
          case "code":
            return (
              <pre key={index} className="overflow-x-auto rounded-row bg-surface-sunken px-3 py-2 font-mono text-label">
                <code>{block.text}</code>
              </pre>
            );
          case "list": {
            const items = block.items.map((item, n) => (
              <li key={n} className="whitespace-pre-wrap">
                {inline(item)}
              </li>
            ));
            return block.ordered ? (
              <ol key={index} start={block.start} className="flex list-decimal flex-col gap-1 pl-6">
                {items}
              </ol>
            ) : (
              <ul key={index} className="flex list-disc flex-col gap-1 pl-6">
                {items}
              </ul>
            );
          }
          case "paragraph":
            return (
              <p key={index} className="whitespace-pre-wrap">
                {inline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
