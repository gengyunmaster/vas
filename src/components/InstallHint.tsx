import { useState } from "react";
import {
  dismissInstallHint,
  isInstallHintDismissed,
  requestInstall,
  useInstallStore,
} from "../pwa/installPrompt";

export function InstallHint() {
  const deferredPrompt = useInstallStore((state) => state.deferredPrompt);
  const installed = useInstallStore((state) => state.installed);
  const ios = useInstallStore((state) => state.ios);
  const [dismissed, setDismissed] = useState(isInstallHintDismissed);

  if (installed || dismissed || (!deferredPrompt && !ios)) return null;

  const dismiss = () => {
    dismissInstallHint();
    setDismissed(true);
  };

  return (
    <div className="install-hint">
      <span className="install-hint-text">
        {deferredPrompt
          ? "Install vas on this device — launch it from your home screen and use it fully offline."
          : "To install vas: tap the browser's Share button, then choose 'Add to Home Screen'."}
      </span>
      <div className="install-hint-actions">
        {deferredPrompt && (
          <button type="button" className="primary" onClick={() => void requestInstall()}>
            Install
          </button>
        )}
        <button type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
