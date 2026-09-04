import { useState } from "react";
import { buildDiagnostics, currentDiagnosticsContext, describeError } from "../diagnostics";

interface ErrorScreenProps {
  error: Error;
  componentStack?: string | null;
}

export function ErrorScreen({ error, componentStack }: ErrorScreenProps) {
  const [copied, setCopied] = useState(false);
  const diagnostics = buildDiagnostics(error, currentDiagnosticsContext(), componentStack);
  const { name, message } = describeError(error);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="error-screen">
      <div className="error-card">
        <h1>Something went wrong</h1>
        <p>
          Your notes are stored locally and were auto-saved. Reload to continue; if the problem
          persists, copy the diagnostics and send them to the developer.
        </p>
        <p className="error-message">
          {name}: {message}
        </p>
        <div className="error-actions">
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" onClick={() => void copyDiagnostics()}>
            {copied ? "Copied" : "Copy diagnostics"}
          </button>
        </div>
        <details className="error-details">
          <summary>Diagnostics</summary>
          <pre>{diagnostics}</pre>
        </details>
      </div>
    </div>
  );
}
