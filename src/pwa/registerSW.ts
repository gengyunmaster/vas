import { registerSW } from "virtual:pwa-register";
import { create } from "zustand";

interface SwUpdateState {
  updateReady: boolean;
  applyUpdate: (() => void) | null;
}

export const useSwUpdateStore = create<SwUpdateState>(() => ({
  updateReady: false,
  applyUpdate: null,
}));

export function dismissSwUpdate(): void {
  useSwUpdateStore.setState({ updateReady: false, applyUpdate: null });
}

export function registerServiceWorker(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useSwUpdateStore.setState({ updateReady: true, applyUpdate: () => void updateSW(true) });
    },
  });
}
