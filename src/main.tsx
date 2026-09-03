import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./fonts";
import { loadToolPrefs } from "./persistence/prefs";
import { watchInstallPrompt } from "./pwa/installPrompt";
import { registerServiceWorker } from "./pwa/registerSW";
import { showErrorBanner } from "./store/errorBanner";
import "./styles.css";
import { applyTheme } from "./theme";

// CSP forbids inline scripts, so the pre-paint theme lands here: the entry
// module runs before the browser's first paint in practice.
applyTheme(loadToolPrefs().theme ?? "system");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

registerServiceWorker();
// Must run early: beforeinstallprompt can fire before React mounts.
watchInstallPrompt();

window.addEventListener("error", (event) => {
  showErrorBanner(event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  showErrorBanner(event.reason);
});

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
