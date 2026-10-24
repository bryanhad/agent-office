import { StartScreen } from "./StartScreen.tsx";
import { useStore } from "./store.ts";

// Chooses the screen from store state only. The snapshot keeps `project` current in
// every tab, so opening a project anywhere switches all of them.
export function App() {
  const connection = useStore((state) => state.connection);
  const status = useStore((state) => state.project);
  const unreachable = connection === "closed";

  // No snapshot yet: blank while the first connect is in flight (milliseconds on
  // localhost), the start screen with the unreachable line once it has failed.
  if (!status) return unreachable ? <StartScreen unreachable /> : null;

  // Always true when pinned, so a pinned instance never shows the start screen.
  if (status.project) return <MainPlaceholder name={status.project.name} />;

  return (
    <StartScreen
      configError={status.config === "invalid" ? status.configError : undefined}
      unreachable={unreachable}
    />
  );
}

// Stands in for the office and chat until step 11.
function MainPlaceholder({ name }: { name: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-text-muted">
        <span className="font-mono text-text">{name}</span> is open. The office and chat come in step 11.
      </p>
    </main>
  );
}
