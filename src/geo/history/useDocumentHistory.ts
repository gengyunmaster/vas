import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoDocument } from "../model";
import type { History } from "./history";
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  replacePresent,
  undo,
} from "./history";

export interface DocumentHistory {
  document: GeoDocument;
  canUndo: boolean;
  canRedo: boolean;
  commit(next: GeoDocument): void;
  reset(next: GeoDocument): void;
  undo(): void;
  redo(): void;
  beginTransient(): void;
  updateTransient(update: (document: GeoDocument) => GeoDocument): void;
  endTransient(): void;
}

export function useDocumentHistory(initial: GeoDocument): DocumentHistory {
  const [history, setHistory] = useState<History>(() => createHistory(initial));
  const historyRef = useRef(history);
  const snapshotRef = useRef<GeoDocument | null>(null);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const commit = useCallback((next: GeoDocument) => {
    setHistory((current) => pushHistory(current, next));
  }, []);

  const reset = useCallback((next: GeoDocument) => {
    snapshotRef.current = null;
    setHistory(createHistory(next));
  }, []);

  const undoHistory = useCallback(() => setHistory(undo), []);
  const redoHistory = useCallback(() => setHistory(redo), []);

  const beginTransient = useCallback(() => {
    if (snapshotRef.current === null) snapshotRef.current = historyRef.current.present;
  }, []);

  const updateTransient = useCallback((update: (document: GeoDocument) => GeoDocument) => {
    setHistory((current) => replacePresent(current, update(current.present)));
  }, []);

  const endTransient = useCallback(() => {
    const snapshot = snapshotRef.current;
    snapshotRef.current = null;
    if (snapshot === null) return;
    setHistory((current) =>
      current.present === snapshot
        ? current
        : { past: [...current.past, snapshot], present: current.present, future: [] },
    );
  }, []);

  return {
    document: history.present,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    commit,
    reset,
    undo: undoHistory,
    redo: redoHistory,
    beginTransient,
    updateTransient,
    endTransient,
  };
}
