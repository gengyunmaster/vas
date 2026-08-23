import type { GeoDocument } from "../model";
import { addObject, dependenciesOf } from "../model";

// Multi-click construction tools fork a working document at the first click
// and commit only at the last one. If the live document changed meanwhile
// (undo, delete, inspector edits), pushing the stale fork would silently
// revert those changes. Replay the objects the construction added onto the
// live document instead. Returns null when the construction references an
// object that no longer exists.
export function restage(
  base: GeoDocument,
  working: GeoDocument,
  live: GeoDocument,
): GeoDocument | null {
  if (live === base) return working;
  const added = Object.values(working.objects).filter((object) => !base.objects[object.id]);
  const available = new Set(Object.keys(live.objects));
  let next = live;
  for (const object of added) {
    if (dependenciesOf(object).some((dependency) => !available.has(dependency))) return null;
    next = addObject(next, object);
    available.add(object.id);
  }
  return next;
}
