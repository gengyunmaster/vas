import { useEffect, useRef } from "react";
import { SHORTCUT_HELP } from "../shortcuts";
import { useShortcutsStore } from "../store/shortcuts";
import { usePresence } from "./usePresence";

export function ShortcutsDialog() {
  const open = useShortcutsStore((state) => state.open);
  const setOpen = useShortcutsStore((state) => state.setOpen);
  const presence = usePresence(open, 140);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "?") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  // The button only exists once presence mounts the dialog, a render later.
  useEffect(() => {
    if (open && presence.mounted) closeRef.current?.focus();
  }, [open, presence.mounted]);

  if (!presence.mounted) return null;

  return (
    <div className={presence.closing ? "dialog-overlay closing" : "dialog-overlay"}>
      <div
        className="dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="dialog-title">Keyboard shortcuts</div>
        {SHORTCUT_HELP.map((group) => (
          <div key={group.title} className="shortcut-group">
            <div className="shortcut-group-title">{group.title}</div>
            {group.entries.map((entry) => (
              <div key={entry.action} className="shortcut-row">
                <span className="shortcut-action">{entry.action}</span>
                <span className="shortcut-keys">{entry.keys}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="dialog-actions">
          <button ref={closeRef} type="button" className="primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
