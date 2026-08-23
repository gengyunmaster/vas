import { describe, expect, it } from "vitest";
import {
  addObject,
  addObjects,
  createDocument,
  freePoint,
  midpointOf,
  parseDocument,
  pointPosition,
  resolvePositions,
  segment,
  serializeDocument,
} from "../model";
import { buildToolDefinition, collectClosure, instantiateTool } from "../tools/customTools";

const buildMidpointTool = () => {
  let document = createDocument();
  const a = freePoint(0, 0);
  const b = freePoint(4, 0);
  document = addObjects(document, [a, b]);
  const seg = segment(a.id, b.id);
  document = addObject(document, seg);
  const mid = midpointOf(seg.id);
  document = addObject(document, mid);
  const def = buildToolDefinition("Midpoint tool", document, mid.id);
  return { document, def, a, b, seg, mid };
};

describe("custom tools", () => {
  it("collects the dependency closure", () => {
    const { document, mid, seg, a, b } = buildMidpointTool();
    const closure = collectClosure(document, mid.id);
    expect(closure.map((object) => object.id).sort()).toEqual([a.id, b.id, seg.id, mid.id].sort());
  });

  it("builds a definition with free-point givens", () => {
    const { def, a, b } = buildMidpointTool();
    if (!def) throw new Error("expected a tool definition");
    expect(def.givens.sort()).toEqual([a.id, b.id].sort());
    expect(def.objects).toHaveLength(4);
  });

  it("instantiates the template on new givens", () => {
    const { def } = buildMidpointTool();
    if (!def) throw new Error("expected a tool definition");
    let document = createDocument();
    const p = freePoint(1, 1);
    const q = freePoint(3, 3);
    document = addObjects(document, [p, q]);
    const clones = instantiateTool(def, [p.id, q.id]);
    document = addObjects(document, clones);
    expect(clones).toHaveLength(2);
    const cloneMid = clones.find((object) => object.kind === "point" && object.role === "midpoint");
    if (!cloneMid) throw new Error("expected the midpoint clone");
    expect(pointPosition(document, cloneMid.id)).toEqual([2, 2]);
    expect(resolvePositions(document).size).toBe(3);
  });

  it("instantiated clones survive serialization", () => {
    const { def } = buildMidpointTool();
    if (!def) throw new Error("expected a tool definition");
    let document = createDocument();
    const p = freePoint(0, 0);
    const q = freePoint(0, 2);
    document = addObjects(document, [p, q]);
    document = addObjects(document, instantiateTool(def, [p.id, q.id]));
    const restored = parseDocument(serializeDocument(document));
    expect(Object.keys(restored.objects)).toHaveLength(Object.keys(document.objects).length);
  });

  it("rejects definitions without givens", () => {
    let document = createDocument();
    const a = freePoint(1, 1);
    document = addObject(document, a);
    expect(buildToolDefinition("Lonely point", document, a.id)).toBeNull();
  });
});
