# 005: Docs in Markdown, images as separate files

**Decision:** Project docs are Markdown files. Design images are separate files in `docs/design/`; notes in the docs describe intent, and the images are the source of truth for the look.

**Why:**
- Claude Code reads docs as text, so HTML tags would be meaningless tokens read every session.
- Images work the same in either format, because Claude only sees an image when it opens the file.
- Markdown still renders well for me in VS Code and GitHub.

**Alternatives considered:**
- HTML docs. Better for humans browsing, worse as agent context.
- One big brief file. Split instead, because the vision rarely changes and plans change often.

Details: [vision.md, Design](../vision.md#8-design).
