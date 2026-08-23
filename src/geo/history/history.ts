import type { GeoDocument } from "../model";

export interface History {
  past: GeoDocument[];
  present: GeoDocument;
  future: GeoDocument[];
}

export const createHistory = (initial: GeoDocument): History => ({
  past: [],
  present: initial,
  future: [],
});

export const HISTORY_LIMIT = 300;

export const pushHistory = (history: History, next: GeoDocument): History =>
  next === history.present
    ? history
    : {
        past: [...history.past, history.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
      };

export const replacePresent = (history: History, next: GeoDocument): History =>
  next === history.present ? history : { ...history, present: next };

export const undo = (history: History): History => {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
};

export const redo = (history: History): History => {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
};

export const canUndo = (history: History): boolean => history.past.length > 0;

export const canRedo = (history: History): boolean => history.future.length > 0;
