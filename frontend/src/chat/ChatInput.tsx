// The input bar (brief §6): Enter sends, Shift+Enter adds a newline, Esc cancels the
// last queued message. The send button says "Queue" while the agent is busy, since
// that's what will happen; Stop shows only then.

import { useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { StopGlyph } from "../glyphs.tsx";
import { isBusy, useStore } from "../store.ts";
import { send } from "../ws.ts";

const MAX_LINES = 8;

export function ChatInput({ disconnected }: { disconnected: boolean }) {
  const busy = useStore((state) => isBusy(state.agents));
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const canSend = !disconnected && text.trim() !== "";

  // Grow with the text up to MAX_LINES, then scroll inside.
  useLayoutEffect(() => {
    const element = input.current!;
    const style = getComputedStyle(element);
    const max = parseFloat(style.lineHeight) * MAX_LINES + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight + 2, max)}px`;
  }, [text]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    send({ type: "send_message", text: text.trim() });
    setText("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME candidate isn't a send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      // Read at keypress time, so it's the last one now, not at the last render.
      const last = useStore.getState().queued.at(-1);
      if (last) {
        event.preventDefault();
        send({ type: "cancel_message", id: last.id });
      }
    }
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-3 border-t border-line p-4">
      <textarea
        ref={input}
        autoFocus
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message the manager…"
        aria-label="Message the manager"
        className="min-w-0 flex-1 resize-none rounded-card border border-line bg-surface px-4 py-2.5 placeholder:text-text-faint"
      />
      {busy && (
        <button
          type="button"
          onClick={() => send({ type: "stop" })}
          disabled={disconnected}
          className="flex items-center gap-1.5 rounded-card border border-text px-4 py-2.5 font-semibold disabled:opacity-60"
        >
          <StopGlyph />
          Stop
        </button>
      )}
      <button
        type="submit"
        disabled={!canSend}
        className="rounded-card bg-text px-5 py-2.5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Queue" : "Send"}
      </button>
    </form>
  );
}
