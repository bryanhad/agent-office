// The line at the bottom of the chat while the agent thinks or works (brief §6): a
// playful word, picked once per turn, with the turn's elapsed seconds, and the current
// activity under it. Hidden while waiting (the permission card is the focus then) and
// when idle. All local: no model calls.
//
// Turn tracking lives here, not in applyEvent: it needs the clock and randomness, which
// would make the reducer impure. A reload mid-turn restarts the count from 0.

import { useEffect, useState } from "react";
import { hasPending, isBusy, useStore, type ChatItem } from "../store.ts";

const WORDS = [
  "Pondering",
  "Noodling",
  "Tinkering",
  "Mulling",
  "Puzzling",
  "Rummaging",
  "Sketching",
  "Untangling",
  "Percolating",
  "Fiddling",
  "Musing",
  "Scheming",
  "Brewing",
  "Whittling",
  "Sifting",
  "Doodling",
  "Chewing on it",
  "Connecting dots",
  "Head-scratching",
  "Ruminating",
];

interface Turn {
  key: string | undefined;
  startedAt: number;
  word: string;
}

// The backend goes from one queued turn straight into the next without passing idle,
// so a new delivered message is what starts a new turn, not only busy starting.
function lastDeliveredId(timeline: ChatItem[]): string | undefined {
  return timeline.findLast((item) => item.kind === "user" && item.status === "delivered")?.id;
}

export function ThinkingIndicator() {
  const manager = useStore((state) => state.agents.find((agent) => agent.id === "manager"));
  const turnKey = useStore((state) => lastDeliveredId(state.timeline));
  const busy = manager !== undefined && isBusy([manager]);
  const pending = useStore((state) => hasPending(state.timeline));
  // Checked on the cards too, not only the state, so it never shows next to a card.
  const shown = !pending && (manager?.state === "thinking" || manager?.state === "working");
  const [turn, setTurn] = useState<Turn | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!busy) {
      setTurn(null);
      return;
    }
    setTurn((current) =>
      current && current.key === turnKey
        ? current
        : { key: turnKey, startedAt: Date.now(), word: WORDS[Math.floor(Math.random() * WORDS.length)] },
    );
  }, [busy, turnKey]);

  useEffect(() => {
    if (!shown) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [shown]);

  if (!shown || !turn) return null;
  const seconds = Math.max(0, Math.floor((now - turn.startedAt) / 1000));

  return (
    <div className="flex flex-col gap-0.5 text-label">
      <p className="text-text-muted">
        {turn.word}
        <span className="thinking-dots" aria-hidden="true">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>{" "}
        · {seconds}s
      </p>
      {manager.activity && <p className="truncate text-text-faint">{manager.activity}</p>}
    </div>
  );
}
