import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  text?: string;
  initial?: string;
  confirmLabel?: string;
  password?: boolean;
}

interface DialogState {
  confirm: ConfirmOptions | null;
  prompt: PromptOptions | null;
}

export const useDialogStore = create<DialogState>(() => ({ confirm: null, prompt: null }));

let confirmResolver: ((ok: boolean) => void) | null = null;
let promptResolver: ((value: string | null) => void) | null = null;

// One dialog at a time; a second request while open resolves as cancelled.
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (confirmResolver) return Promise.resolve(false);
  return new Promise((resolve) => {
    confirmResolver = resolve;
    useDialogStore.setState({ confirm: options });
  });
}

export function settleConfirm(ok: boolean): void {
  const resolve = confirmResolver;
  confirmResolver = null;
  useDialogStore.setState({ confirm: null });
  resolve?.(ok);
}

export function askPrompt(options: PromptOptions): Promise<string | null> {
  if (promptResolver) return Promise.resolve(null);
  return new Promise((resolve) => {
    promptResolver = resolve;
    useDialogStore.setState({ prompt: options });
  });
}

export function settlePrompt(value: string | null): void {
  const resolve = promptResolver;
  promptResolver = null;
  useDialogStore.setState({ prompt: null });
  resolve?.(value);
}
