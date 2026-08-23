import { useEffect, useState } from "react";
import type { DebugEntry } from "../debug";
import { clearDebug, debugLog, subscribeDebug } from "../debug";

const LAYOUT_SELECTORS = ["html", "body", "#root", ".app", ".main", ".board-wrap", ".board-host"];

export function DebugPanel() {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  useEffect(() => subscribeDebug(setEntries), []);

  const dumpLayout = () => {
    for (const selector of LAYOUT_SELECTORS) {
      const element = document.querySelector(selector);
      if (!element) {
        debugLog(`layout ${selector}: MISSING`);
        continue;
      }
      const rect = element.getBoundingClientRect();
      debugLog(`layout ${selector}: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    }
  };

  return (
    <div className="debug-panel">
      <div className="debug-toolbar">
        <span>debug</span>
        <button type="button" onClick={dumpLayout}>
          layout
        </button>
        <button type="button" onClick={clearDebug}>
          clear
        </button>
      </div>
      <div className="debug-entries">
        {entries.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: append-only debug log has no stable ids
          <div key={index}>
            {entry.time} {entry.text}
          </div>
        ))}
      </div>
    </div>
  );
}
