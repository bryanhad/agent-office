// The idle blob's face: the app's mark on the start screen. Only the idle look; the
// state system (every state's color, glyph, label, eyes and motion) comes with the office.

export function BlobFace({ size = 56 }: { size?: number }) {
  const eye = Math.round(size * 0.1);
  return (
    <div
      aria-hidden="true"
      className="blob-idle flex items-center justify-center rounded-full border-2 border-idle-strong/40 bg-idle-body"
      style={{ width: size, height: size, gap: eye * 1.6 }}
    >
      <span className="blob-eye rounded-full bg-text" style={{ width: eye, height: eye * 1.5 }} />
      <span className="blob-eye rounded-full bg-text" style={{ width: eye, height: eye * 1.5 }} />
    </div>
  );
}
