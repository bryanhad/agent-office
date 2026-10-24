// Assistant text as markdown (brief §6): GFM (bold, tables, strikethrough, lists, code)
// via react-markdown. A library now because GFM is past the point where a hand-rolled
// parser stays small; step 11's first version missed **bold**.
//
// Never raw HTML: agent output can contain content from files the agent read. There is
// no rehype-raw, and htmlAsText turns every HTML node into plain text, so `<b>hi</b>`
// shows as those characters instead of rendering or silently disappearing.

import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
}

// Block containers: HTML directly inside one is a block of its own, so it becomes a
// paragraph of text; anywhere else it's inline and becomes just text.
const BLOCK_PARENTS = new Set(["root", "blockquote", "listItem"]);

function htmlAsText() {
  return (tree: MdNode) => {
    const walk = (node: MdNode) => {
      node.children = node.children?.map((child) => {
        if (child.type !== "html") {
          walk(child);
          return child;
        }
        const text = { type: "text", value: child.value };
        return BLOCK_PARENTS.has(node.type) ? { type: "paragraph", children: [text] } : text;
      });
    };
    walk(tree);
  };
}

// Headings stay at body size: a chat reply isn't a document.
const heading = (props: ComponentProps<"h1">) => <p className="font-semibold">{props.children}</p>;

const components: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  // The default urlTransform blanks unsafe schemes such as javascript:; those show as
  // plain text rather than as a link to nowhere.
  a: ({ href, children }) =>
    !href ? (
      <>{children}</>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
        {children}
      </a>
    ),
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-6">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="flex list-decimal flex-col gap-1 pl-6">
      {children}
    </ol>
  ),
  // Inline code; inside a <pre> the block styles below take over.
  code: ({ children }) => <code className="rounded-[4px] bg-surface-sunken px-1 py-px font-mono text-[0.9em]">{children}</code>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-row bg-surface-sunken px-3 py-2 font-mono text-label [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="border-collapse text-label">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} className="border border-line bg-surface-sunken px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-line px-2 py-1">
      {children}
    </td>
  ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 break-words [&_li>p]:inline">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, htmlAsText]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
