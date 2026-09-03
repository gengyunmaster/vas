import { useEffect, useState } from "react";
import {
  formatBytes,
  getStorageHealth,
  type StorageHealth,
  storageLevel,
} from "../persistence/storageHealth";

export function StorageSection() {
  const [health, setHealth] = useState<StorageHealth | null>(null);
  useEffect(() => {
    void getStorageHealth().then(setHealth);
  }, []);
  if (!health || health.quota <= 0) return null;
  const level = storageLevel(health);
  const percent = Math.min(100, (health.usage / health.quota) * 100);
  return (
    <section className="settings-section">
      <div className="settings-label">Storage</div>
      <div className="storage-meter">
        <div className="storage-meter-track">
          <div
            className={level ? `storage-meter-fill ${level}` : "storage-meter-fill"}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="storage-meter-label">
          {formatBytes(health.usage)} of {formatBytes(health.quota)} used
          {health.persisted ? " · persisted" : ""}
        </div>
      </div>
    </section>
  );
}
