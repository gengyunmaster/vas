import { create } from "zustand";

interface ToastItem {
  id: number;
  message: string;
  leaving: boolean;
}

interface ToastState {
  toasts: ToastItem[];
}

const TOAST_MS = 3400;
const EXIT_MS = 160;

let nextId = 1;

export const useToastStore = create<ToastState>(() => ({ toasts: [] }));

// Callable from anywhere, including non-React modules (autosave, importers).
export function toast(message: string): void {
  const id = nextId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts, { id, message, leaving: false }],
  }));
  window.setTimeout(() => {
    useToastStore.setState((state) => ({
      toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    }));
    window.setTimeout(() => {
      useToastStore.setState((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, EXIT_MS);
  }, TOAST_MS);
}
