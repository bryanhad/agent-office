// The main screen (brief §4, §5): office | chat side by side from 760px, with the chat
// at 420px up to 1200px and 480px above; below 760px the office shrinks to a strip
// above the chat. Both office views read only `project` and `agents` from the store.

import { ChatPanel } from "./chat/ChatPanel.tsx";
import { Office } from "./office/Office.tsx";
import { OfficeStrip } from "./office/OfficeStrip.tsx";

export function MainScreen({ projectName }: { projectName: string }) {
  return (
    <div className="flex h-dvh flex-col gap-3 p-4 min-[760px]:flex-row min-[760px]:gap-4">
      <Office />
      <OfficeStrip />
      <ChatPanel
        projectName={projectName}
        className="min-h-0 flex-1 min-[760px]:w-[420px] min-[760px]:flex-none min-[1200px]:w-[480px]"
      />
    </div>
  );
}
