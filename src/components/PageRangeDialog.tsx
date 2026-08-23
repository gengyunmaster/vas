import { useEffect, useState } from "react";
import { normalizePageRange } from "../model/pdfPage";
import { settlePageRange } from "../store/pdfRangePrompt";
import { useBoardStore } from "../store/useBoardStore";

export function PageRangeDialog() {
  const request = useBoardStore((state) => state.pdfRangeRequest);
  const [first, setFirst] = useState("1");
  const [last, setLast] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const numPages = request?.numPages ?? 0;
  useEffect(() => {
    if (!request) return;
    setFirst("1");
    setLast(String(request.numPages));
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

  if (!request) return null;

  const confirm = () => {
    const range = normalizePageRange(Number(first), Number(last), numPages);
    if (!range) {
      setError(`Enter whole page numbers between 1 and ${numPages}.`);
      return;
    }
    settlePageRange(range);
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
    <div className="dialog-overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Import PDF">
        <div className="dialog-title">Import PDF</div>
        <p className="dialog-text">
          This PDF has {numPages} {numPages === 1 ? "page" : "pages"}. Choose the page range to
          import.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div className="page-range-fields">
            {field("From", first, setFirst)}
            {field("To", last, setLast)}
          </div>
          {error && <div className="dialog-error">{error}</div>}
          <div className="dialog-actions">
            <button type="button" onClick={() => settlePageRange(null)}>
              Cancel
            </button>
            <button type="submit" className="primary">
              Import
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
