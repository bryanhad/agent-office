# 012: The agent browser starts as a headed Chromium driven by Playwright

Roadmap, not MVP. Context: [vision.md §12](../vision.md#12-long-term-goal-replace-my-claude-code--terminal-browser-workflow).

**Decision:** The first agent browser is a real, visible (headed) Chromium window that the backend drives with Playwright (option C below).
- **Its own browser:** Playwright's Chromium, never my personal browser. I use Arc and it's logged into everything; the agent must not act as me there.
- **Persistent profile** under `~/.agent-office/`, so logins survive restarts.
- **Custom cookies** are set through the browser context.
- **Agent tools:** open URL, text snapshot, click, type, set cookies. They roughly match agent-browser, so habits from my current setup carry over.
- **Shared window:** I can use the same window myself, DevTools included.
- **Permission policy:** browser actions get a deliberate one, e.g. localhost without asking, everything else asks. The tools are gated by `canUseTool` like any other, and never added through `allowedTools`.
- **Swappable display:** the display is kept apart from control, like the office renderer ([decision 004](004-swappable-office-renderer.md)). Once control, cookies and the permission policy work, A or D is chosen to bring the browser inside the office.

**Why:**
- **Token cost depends on how the agent reads the page, not on where the browser is displayed.** Text snapshots with element refs are cheap; screenshots are expensive. A snapshot-based interface like agent-browser keeps token use close to my current setup, wherever the window lives.
- **C is the lowest effort with full fidelity:** a real browser, real DevTools, no input lag. Control, cookies and the permission policy are the hard parts. Building them first, behind a display that is easy to replace, de-risks A and D.
- **A separate profile keeps the agent away from my real accounts**, and still keeps the logins it needs between restarts.

**Reference: my current tool.** [Terminal Browser](https://www.claudemod.com/mods/terminal-browser), a Claude Code mod:
- a real Chromium, rendered offscreen through Electron;
- drawn into the terminal with the kitty graphics protocol;
- driven by the agent through an "agent-browser compatible" CLI (`terminal-browser action`).

The parity target is what it lets the agent do: navigate, click, fill forms, log into the FE with custom cookie payloads, and test features for my BA team.

**Alternatives considered:**
- **(A) Stream a backend browser into a popup in the office.** Polished and fully inside the app, but high effort, with input lag and no DevTools. A candidate once C works.
- **(B) Open Terminal Browser in Ghostty.** Rejected: it splits my workspace again, and its pane controls need a terminal.
- **(D) Agent Office as an Electron app with an embedded real browser.** Native fidelity inside the app, but a larger architecture change (packaging, a main process next to the Node backend). A candidate once C works.
