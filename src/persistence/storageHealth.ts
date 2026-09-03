export interface StorageHealth {
  usage: number;
  quota: number;
  persisted: boolean;
}

export const STORAGE_WARN_RATIO = 0.8;
export const STORAGE_FULL_RATIO = 0.95;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

export type StorageLevel = "full" | "warn" | null;

export function storageLevel(health: StorageHealth): StorageLevel {
  if (health.quota <= 0) return null;
  const ratio = health.usage / health.quota;
  if (ratio >= STORAGE_FULL_RATIO) return "full";
  if (ratio >= STORAGE_WARN_RATIO) return "warn";
  return null;
}

export async function getStorageHealth(): Promise<StorageHealth | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted?.() ?? Promise.resolve(false),
    ]);
    return { usage, quota, persisted };
  } catch {
    return null;
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
