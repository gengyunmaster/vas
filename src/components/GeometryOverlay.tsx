import { lazy, Suspense } from "react";
import type { GeoEmbedPayload } from "../geo/App";
import { ErrorBoundary } from "../geo/ui/ErrorBoundary";
import { insertImageFile } from "../persistence/insertImage";
import { useBoardStore } from "../store/useBoardStore";

const GeoEditor = lazy(() => import("../geo/App"));

export function GeometryOverlay() {
  const editor = useBoardStore((state) => state.geometryEditor);
  const paperColor = useBoardStore(
    (state) => (state.pages[state.viewPageIndex] ?? state.pages[0])?.paperColor ?? "#ffffff",
  );
  if (!editor) return null;
  const close = () => useBoardStore.getState().closeGeometry();
  const handleEmbed = async (payload: GeoEmbedPayload) => {
    try {
      const file = new File([payload.svg], "figure.svg", { type: "image/svg+xml" });
      await insertImageFile(file);
      close();
    } catch (error) {
      console.error("Failed to embed geometry figure", error);
      window.alert("Failed to embed the figure.");
    }
  };
  return (
    <div className="geometry-overlay geo">
      <Suspense fallback={<div className="geometry-loading">Loading geometry editor…</div>}>
        <ErrorBoundary>
          <GeoEditor
            paperColor={paperColor}
            initialDocument={null}
            onEmbed={(payload) => void handleEmbed(payload)}
            onCancel={close}
          />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
}
