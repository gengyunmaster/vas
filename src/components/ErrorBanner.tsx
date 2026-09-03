import { useState } from "react";
import { dismissErrorBanner, useErrorBannerStore } from "../store/errorBanner";
import { toast } from "../store/toasts";

export function ErrorBanner() {
  const diagnostics = useErrorBannerStore((state) => state.diagnostics);
  const [copied, setCopied] = useState(false);
  if (!diagnostics) return null;

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics);
      setCopied(true);
    } catch {
      toast("Copy failed");
    }
  };

  return (
    <div className="error-banner" role="alert">
      <span>Something went wrong</span>
      <button type="button" onClick={() => void copyDiagnostics()}>
        {copied ? "Copied" : "Copy diagnostics"}
      </button>
      <button type="button" onClick={dismissErrorBanner}>
        Dismiss
      </button>
    </div>
  );
}
