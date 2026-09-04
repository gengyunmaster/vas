import { useEffect, useRef, useState } from "react";
import { normalizePageRange } from "../model/pdfPage";
import { settlePageRange } from "../store/pdfRangePrompt";
import { useBoardStore } from "../store/useBoardStore";
import { useFocusTrap } from "./useFocusTrap";
import { usePresence } from "./usePresence";

export function PageRangeDialog() {
  const request = useBoardStore((state) => state.pdfRangeRequest);
  const [first, setFirst] = useState("1");
  const [last, setLast] = useState("1");
  const [whiteBackground, setWhiteBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const presence = usePresence(request !== null, 140);
  const lastRequest = useRef(request);
  if (request) lastRequest.current = request;
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(request !== null && presence.mounted, dialogRef);

  useEffect(() => {
    if (!request) return;
    setFirst("1");
    setLast(String(request.numPages));
    setWhiteBackground(false);
    setError(null);
  }, [request]);

  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") settlePageRange(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request]);

  if (!presence.mounted || !lastRequest.current) return null;
  const shown = request ?? lastRequest.current;

  const numPages = shown.numPages;
  const single = shown.mode === "single";

  const confirm = () => {
    const range = single
      ? normalizePageRange(Number(first), Number(first), numPages)
      : normalizePageRange(Number(first), Number(last), numPages);
    if (!range) {
      setError(`Enter whole page numbers between 1 and ${numPages}.`);
      return;
    }
    settlePageRange({ ...range, whiteBackground });
  };

  const field = (label: string, value: string, setValue: (value: string) => void) => (
    <label>
      {label}
      <input
        type="number"
        min={1}
        max={numPages}
        step={1}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
      />
    </label>
  );

  return (
    <div className={presence.closing ? "dialog-overlay closing" : "dialog-overlay"}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="PDF page settings"
        ref={dialogRef}
      >
        <div className="dialog-title">PDF page settings</div>
        <p className="dialog-text">
          {single
            ? `This PDF has ${numPages} ${numPages === 1 ? "page" : "pages"}. Choose the page to insert.`
            : `This PDF has ${numPages} ${numPages === 1 ? "page" : "pages"}. Choose the page range to import.`}
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div className="page-range-fields">
            {field(single ? "Page" : "From", first, setFirst)}
            {!single && field("To", last, setLast)}
          </div>
          <label className="dialog-check">
            <input
              type="checkbox"
              checked={whiteBackground}
              onChange={(event) => setWhiteBackground(event.target.checked)}
            />
            White background
          </label>
          {error && <div className="dialog-error">{error}</div>}
          <div className="dialog-actions">
            <button type="button" onClick={() => settlePageRange(null)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              {single ? "Insert" : "Import"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
