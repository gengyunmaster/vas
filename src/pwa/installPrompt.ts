import { create } from "zustand";

// Not yet in TS's DOM lib; Chrome/Edge fire it when the app is installable.
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
  ios: boolean;
}

export const useInstallStore = create<InstallState>(() => ({
  deferredPrompt: null,
  installed: false,
  ios: false,
}));

export function detectIos(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS 13+ reports a macOS user agent; touch points give it away.
  return platform === "MacIntel" && maxTouchPoints > 1;
}

const DISMISS_KEY = "vas-install-hint-dismissed";

export function isInstallHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Storage may be unavailable (private mode); the hint simply reappears.
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export function watchInstallPrompt(): void {
  useInstallStore.setState({
    installed: isStandalone(),
    ios: detectIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
  });
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    useInstallStore.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    useInstallStore.setState({ deferredPrompt: null, installed: true });
  });
}

export async function requestInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const deferred = useInstallStore.getState().deferredPrompt;
  if (!deferred) return "unavailable";
  // A captured event fires its native prompt at most once; drop it either way.
  useInstallStore.setState({ deferredPrompt: null });
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  return outcome;
}
