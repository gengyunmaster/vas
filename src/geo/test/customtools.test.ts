import { describe, expect, it } from "vitest";
import type { BoardController } from "../board";
import type { GeoDocument, ObjectId } from "../model";
import { addObjects, createDocument, freePoint, segment } from "../model";
import { buildToolDefinition, createCustomTool, isCustomToolDef } from "../tools/customTools";
import type { PointerInfo, ToolContext } from "../tools/types";

const makeDocument = () => {
  const a = freePoint(0, 0);
  const b = freePoint(2, 0);
  const s = segment(a.id, b.id);
  const document = addObjects(createDocument(), [a, b, s]);
  return { document, a, b, s };
};

const stubContext = (document: GeoDocument, pickQueue: (ObjectId | null)[]) => {
  const commits: GeoDocument[] = [];
  const statuses: string[] = [];
  const controller = {
    pixelsToUnits: (px: number) => px / 50,
    pickPoint: () => pickQueue.shift() ?? null,
    clearPreview: () => {},
    viewBox: () => [-8, 5, 16, -10] as const,
  } as unknown as BoardController;
  const context: ToolContext = {
    controller,
    getDocument: () => document,
    getSelected: () => null,
    commit: (next) => {
      commits.push(next);
    },
    setSelected: () => {},
    setStatus: (message) => {
      statuses.push(message);
    },
    snap: (info: PointerInfo) => ({ kind: "none", position: info.position }),
    openDialog: () => {},
  };
  return { context, commits, statuses };
};

const click: PointerInfo = { position: [0, 0], ctrlKey: false, shiftKey: false };

describe("custom tools", () => {
  it("ignores picking the same point for two givens", () => {
    const { document, a, b, s } = makeDocument();
    const def = buildToolDefinition("doubler", document, s.id);
    if (!def) throw new Error("expected a tool definition");
    const { context, commits, statuses } = stubContext(document, [a.id, a.id, b.id]);
    const tool = createCustomTool(def, context);
    if (!tool) throw new Error("expected a tool");
    tool.activate?.();
    tool.pointerDown(click);
    expect(commits).toHaveLength(1);
    expect(statuses.at(-1)).toBe("doubler: click given point 2 of 2");
    tool.pointerDown(click);
    expect(commits).toHaveLength(1);
    expect(statuses.at(-1)).toBe("doubler: click given point 2 of 2");
    tool.pointerDown(click);
    expect(commits).toHaveLength(2);
    expect(Object.keys(commits[1].objects)).toHaveLength(4);
  });

  it("rejects imported defs with no givens or fewer than two objects", () => {
    const { document, a, s } = makeDocument();
    const def = buildToolDefinition("doubler", document, s.id);
    if (!def) throw new Error("expected a tool definition");
    expect(isCustomToolDef(def)).toBe(true);
    expect(isCustomToolDef({ ...def, givens: [] })).toBe(false);
    expect(isCustomToolDef({ name: "lone", givens: [a.id], objects: [a] })).toBe(false);
  });
});
