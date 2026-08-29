import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./fonts";
import { loadToolPrefs } from "./persistence/prefs";
import { registerServiceWorker } from "./pwa/registerSW";
import "./styles.css";
import { applyTheme } from "./theme";

// CSP forbids inline scripts, so the pre-paint theme lands here: the entry
// module runs before the browser's first paint in practice.
applyTheme(loadToolPrefs().theme ?? "system");

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

registerServiceWorker();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
