import { lazy, Suspense, useEffect, useState } from "react";
import { decodeBlob, ensureImageLoaded, primeImage } from "../engine/imageCache";
import type { GeoEmbedPayload } from "../geo/App";
import { ErrorBoundary } from "../geo/ui/ErrorBoundary";
import { rescaledImageRect } from "../model/image";
import { newId } from "../model/stroke";
import { getGeometry, saveGeometry } from "../persistence/geometries";
import { saveImage } from "../persistence/images";
import { insertImageFile } from "../persistence/insertImage";
import { useBoardStore } from "../store/useBoardStore";

const GeoEditor = lazy(() => import("../geo/App"));

export function GeometryOverlay() {
  const editor = useBoardStore((state) => state.geometryEditor);
  const paperColor = useBoardStore((state) => {
    const page =
      editor?.mode === "edit"
        ? state.pages.find((p) => p.id === editor.pageId)
        : (state.pages[state.viewPageIndex] ?? state.pages[0]);
    return page?.paperColor ?? "#ffffff";
  });
  const [initialDocument, setInitialDocument] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (editor?.mode !== "edit") {
      setInitialDocument(null);
      setLoadError(false);
      return;
    }
    const item = useBoardStore
      .getState()
      .pages.find((p) => p.id === editor.pageId)
      ?.images.find((image) => image.id === editor.itemId);
    if (!item?.geometryId) {
      setLoadError(true);
      return;
    }
    let cancelled = false;
    getGeometry(item.geometryId)
      .then((record) => {
        if (cancelled) return;
        if (record) setInitialDocument(record.document);
        else setLoadError(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [editor]);

  const missing = editor?.mode === "edit" && loadError;
  useEffect(() => {
    if (!missing) return;
    window.alert("The figure's geometry data is missing; it cannot be edited.");
    useBoardStore.getState().closeGeometry();
  }, [missing]);

  if (!editor) return null;
  const close = () => useBoardStore.getState().closeGeometry();

  const handleEmbed = async (payload: GeoEmbedPayload) => {
    try {
      const file = new File([payload.svg], "figure.svg", { type: "image/svg+xml" });
      if (editor.mode === "edit") {
        const geometryId = newId();
        const imageId = newId();
        await saveGeometry({ id: geometryId, document: payload.document });
        const decoded = await decodeBlob(file);
        await saveImage({ id: imageId, mimeType: "image/svg+xml", blob: file });
        primeImage(imageId, decoded);
        const state = useBoardStore.getState();
        const page = state.pages.find((p) => p.id === editor.pageId);
        const item = page?.images.find((image) => image.id === editor.itemId);
        if (page && item) {
          const oldImage = await ensureImageLoaded(item.imageId);
          const oldNatural = oldImage
            ? { width: oldImage.naturalWidth, height: oldImage.naturalHeight }
            : null;
          const rect = rescaledImageRect(
            item,
            oldNatural,
            { width: decoded.naturalWidth, height: decoded.naturalHeight },
            page.width,
            page.height,
          );
          useBoardStore
            .getState()
            .replaceGeometryImage(editor.pageId, editor.itemId, { imageId, geometryId, ...rect });
        }
      } else {
        const geometryId = newId();
        await saveGeometry({ id: geometryId, document: payload.document });
        await insertImageFile(file, geometryId);
      }
      close();
    } catch (error) {
      console.error("Failed to embed geometry figure", error);
      window.alert("Failed to embed the figure.");
    }
  };

  if (missing) return null;
  if (editor.mode === "edit" && initialDocument === null) {
    return (
      <div className="geometry-overlay geo">
        <div className="geometry-loading">Loading geometry editor…</div>
      </div>
    );
  }
  return (
    <div className="geometry-overlay geo">
      <Suspense fallback={<div className="geometry-loading">Loading geometry editor…</div>}>
        <ErrorBoundary>
          <GeoEditor
            paperColor={paperColor}
            initialDocument={initialDocument}
            onEmbed={(payload) => void handleEmbed(payload)}
            onCancel={close}
          />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
}
