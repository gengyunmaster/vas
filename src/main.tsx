import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./fonts";
import { loadToolPrefs } from "./persistence/prefs";
import {
  getStorageHealth,
  requestPersistentStorage,
  storageLevel,
} from "./persistence/storageHealth";
import { watchInstallPrompt } from "./pwa/installPrompt";
import { registerServiceWorker } from "./pwa/registerSW";
import { showErrorBanner } from "./store/errorBanner";
import { toast } from "./store/toasts";
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

void requestPersistentStorage();
void getStorageHealth().then((health) => {
  const level = health ? storageLevel(health) : null;
  if (level === "full")
    toast("Local storage is almost full. Export your notebooks to back them up.");
  else if (level === "warn")
    toast("Local storage is filling up. Consider exporting older notebooks.");
});

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
