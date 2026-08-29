import { useEffect, useRef, useState } from "react";
import { settleConfirm, settlePrompt, useDialogStore } from "../store/dialogs";
import { usePresence } from "./usePresence";

export function ConfirmDialog() {
  const request = useDialogStore((state) => state.confirm);
  const presence = usePresence(request !== null, 140);
  const lastRequest = useRef(request);
  if (request) lastRequest.current = request;
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settleConfirm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);

  // The button only exists once presence mounts the dialog, a render later.
  useEffect(() => {
    if (request && presence.mounted) confirmRef.current?.focus();
  }, [request, presence.mounted]);

  if (!presence.mounted || !lastRequest.current) return null;
  const shown = lastRequest.current;

  return (
    <div className={presence.closing ? "dialog-overlay closing" : "dialog-overlay"}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={shown.title}>
        <div className="dialog-title">{shown.title}</div>
        {shown.text && <p className="dialog-text">{shown.text}</p>}
        <div className="dialog-actions">
          {!shown.hideCancel && (
            <button type="button" onClick={() => settleConfirm(false)}>
              Cancel
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={shown.danger ? "primary danger" : "primary"}
            onClick={() => settleConfirm(true)}
          >
            {shown.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog() {
  const request = useDialogStore((state) => state.prompt);
  const [value, setValue] = useState("");
  const presence = usePresence(request !== null, 140);
  const lastRequest = useRef(request);
  if (request) lastRequest.current = request;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!request) return;
    setValue(request.initial ?? "");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settlePrompt(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);

  useEffect(() => {
    if (!request || !presence.mounted) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [request, presence.mounted]);

  if (!presence.mounted || !lastRequest.current) return null;
  const shown = lastRequest.current;

  return (
    <div className={presence.closing ? "dialog-overlay closing" : "dialog-overlay"}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={shown.title}>
        <div className="dialog-title">{shown.title}</div>
        {shown.text && <p className="dialog-text">{shown.text}</p>}
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // Passwords keep whitespace; text input trims and treats empty as cancel.
            settlePrompt(shown.password ? value || null : value.trim() || null);
          }}
        >
          <input
            ref={inputRef}
            className="dialog-input"
            type={shown.password ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <div className="dialog-actions">
            <button type="button" onClick={() => settlePrompt(null)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {shown.confirmLabel ?? "OK"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
