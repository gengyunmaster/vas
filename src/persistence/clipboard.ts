import { type ClipboardContent, serializeClipboard } from "../model/clipboard";

// Mirrors the in-memory clipboard into the system clipboard so paste can tell
// vas data from foreign text. Best-effort: denied permission simply leaves the
// in-memory clipboard as the fallback path.
export function writeSystemClipboard(content: ClipboardContent): void {
  try {
    void navigator.clipboard?.writeText(serializeClipboard(content)).catch(() => {});
  } catch {
    // navigator.clipboard unavailable (insecure context); in-memory still works.
  }
}
