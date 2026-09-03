import { dismissSwUpdate, useSwUpdateStore } from "../pwa/registerSW";

export function UpdateBanner() {
  const updateReady = useSwUpdateStore((state) => state.updateReady);
  const applyUpdate = useSwUpdateStore((state) => state.applyUpdate);
  if (!updateReady) return null;
  return (
    <div className="update-banner" role="status">
      <span>A new version of vas is ready</span>
      <button type="button" className="primary" onClick={() => applyUpdate?.()}>
        Reload
      </button>
      <button type="button" onClick={dismissSwUpdate}>
        Later
      </button>
    </div>
  );
}
