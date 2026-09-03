import type { ReactNode } from "react";
import { ErrorBoundary as AppErrorBoundary } from "../../components/ErrorBoundary";

export function ErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary
      fallback={(error) => (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>{error.message}</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    >
      {children}
    </AppErrorBoundary>
  );
}
