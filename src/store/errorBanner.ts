import { create } from "zustand";
import { buildDiagnostics, currentDiagnosticsContext } from "../diagnostics";

interface ErrorBannerState {
  diagnostics: string | null;
}

export const useErrorBannerStore = create<ErrorBannerState>(() => ({ diagnostics: null }));

// Non-fatal errors (engine rAF, async pipelines) land here; fatal render errors
// are taken over by the app-level ErrorBoundary instead.
export function showErrorBanner(error: unknown): void {
  console.error("Unhandled error", error);
  useErrorBannerStore.setState({
    diagnostics: buildDiagnostics(error, currentDiagnosticsContext()),
  });
}

export function dismissErrorBanner(): void {
  useErrorBannerStore.setState({ diagnostics: null });
}
