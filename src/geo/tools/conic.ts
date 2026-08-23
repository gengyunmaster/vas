import type { ConicFeatureName, ConicLine, GeoDocument, ObjectId, XY } from "../model";
import {
  addObject,
  addObjects,
  circleTangentLines,
  conicFeatureLineFromParams,
  conicFeaturePointFromParams,
  conicFeaturePointOf,
  conicLineOf,
  conicOf,
  conicTangentFromParams,
  distanceToFragments,
  distanceToShape,
  listObjects,
  parabolaThroughPoints,
  pointPosition,
  resolveConic,
  resolveShapePositions,
  sampleConic,
  tangentLineOf,
  threePointParabolaOf,
} from "../model";
import { resolveAnchorPoint } from "./anchor";
import { PICK_TOLERANCE_PX } from "./constants";
import { nearestLinearShape } from "./pick";
import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type ConicToolId = Extract<
  ToolId,
  "ellipse" | "hyperbola" | "parabola" | "eccentric" | "parabola3" | "tangent" | "conicFeatures"
>;

const PROMPTS: Record<ConicToolId, string> = {
  ellipse: "Ellipse: click focus 1",
  hyperbola: "Hyperbola: click focus 1",
  parabola: "Parabola: click the focus",
  eccentric: "Conic: click the focus",
  parabola3: "Parabola (3 points): click the first point",
  tangent: "Tangent: click a point",
  conicFeatures:
    "Features: click a conic to create its foci, center, vertices, directrices, asymptotes",
};

const CONIC_FEATURE_POINTS: ConicFeatureName[] = [
  "focus1",
  "focus2",
  "center",
  "vertex1",
  "vertex2",
];
const CONIC_FEATURE_LINES: ConicLine["feature"][] = [
  "directrix1",
  "directrix2",
  "asymptote1",
  "asymptote2",
];

export function createConicTool(id: ConicToolId, context: ToolContext): Tool {
  let picked: ObjectId[] = [];

  const tolerance = () => context.controller.pixelsToUnits(PICK_TOLERANCE_PX);

  const reset = () => {
    picked = [];
    context.controller.clearPreview();
  };

  const nearestConic = (
    position: XY,
    document: GeoDocument,
  ): { id: ObjectId; d: number } | null => {
    let best: { id: ObjectId; d: number } | null = null;
    const consider = (candidate: ObjectId, fragments: XY[][] | null) => {
      if (!fragments) return;
      const d = distanceToFragments(position, fragments);
      if (d <= tolerance() && (!best || d < best.d)) best = { id: candidate, d };
    };
    for (const conic of listObjects(document, "conic")) {
      if (conic.hidden) continue;
      consider(conic.id, sampleConic(document, conic.id));
    }
    return best;
  };

  return {
    id,
    activate() {
      context.setStatus(PROMPTS[id]);
    },
    deactivate() {
      reset();
      context.setStatus("");
    },
    cancel() {
      reset();
      context.setStatus(PROMPTS[id]);
    },
    pointerDown(info: PointerInfo) {
      const document = context.getDocument();
      if (picked.some((pointId) => !document.objects[pointId])) reset();

      if (id === "tangent") {
        if (picked.length === 0) {
          const anchor = resolveAnchorPoint(info, context);
          picked.push(anchor.pointId);
          context.commit(anchor.document);
          context.setStatus("Tangent: click a circle or a conic");
          return true;
        }
        const pointId = picked[0];
        const working = context.getDocument();
        const point = pointPosition(working, pointId);
        if (!point) {
          reset();
          return true;
        }
        const limit = tolerance();
        let circleHit: { id: ObjectId; d: number } | null = null;
        for (const circle of [
          ...listObjects(working, "circle"),
          ...listObjects(working, "circumcircle"),
        ]) {
          if (circle.hidden) continue;
          const shape = resolveShapePositions(working, circle.id);
          if (shape?.type !== "circle") continue;
          const d = distanceToShape(info.position, shape);
          if (d <= limit && (!circleHit || d < circleHit.d)) circleHit = { id: circle.id, d };
        }
        const conicHit = nearestConic(info.position, working);
        const target = circleHit && (!conicHit || circleHit.d <= conicHit.d) ? circleHit : conicHit;
        const targetObject = target ? working.objects[target.id] : undefined;
        const circleTarget =
          targetObject?.kind === "circle" || targetObject?.kind === "circumcircle";
        if (!targetObject || (!circleTarget && targetObject.kind !== "conic")) {
          context.setStatus("Click a circle or a conic");
          return true;
        }
        if (circleTarget) {
          const shape = resolveShapePositions(working, targetObject.id);
          if (shape?.type !== "circle") {
            context.setStatus("Cannot resolve this circle");
            return true;
          }
          const lines = circleTangentLines(shape.center, shape.radius, point);
          if (lines.length === 0) {
            reset();
            context.setStatus("No tangent: the point is inside the circle");
            return true;
          }
          context.commit(
            addObjects(
              working,
              lines.map((_, index) => tangentLineOf(pointId, targetObject.id, index)),
            ),
          );
        } else {
          const params = resolveConic(working, targetObject.id);
          if (!params || !conicTangentFromParams(params, point)) {
            reset();
            context.setStatus("Tangent needs a point on the conic; pick the point again");
            return true;
          }
          context.commit(addObject(working, tangentLineOf(pointId, targetObject.id, 0)));
        }
        reset();
        context.setStatus(PROMPTS[id]);
        return true;
      }

      if (id === "conicFeatures") {
        const conicId = nearestConic(info.position, document)?.id ?? null;
        if (!conicId) {
          context.setStatus("No conic there");
          return true;
        }
        const params = resolveConic(document, conicId);
        if (!params) {
          context.setStatus("Cannot resolve this conic");
          return true;
        }
        const pointFeatures = CONIC_FEATURE_POINTS.filter(
          (feature) => conicFeaturePointFromParams(params, feature) !== null,
        );
        const lineFeatures = CONIC_FEATURE_LINES.filter(
          (feature) => conicFeatureLineFromParams(params, feature) !== null,
        );
        const existing = new Set(
          Object.values(document.objects)
            .filter(
              (object) =>
                (object.kind === "point" &&
                  object.role === "conicFeature" &&
                  object.conic === conicId) ||
                (object.kind === "conicLine" && object.conic === conicId),
            )
            .map((object) =>
              object.kind === "point" && object.role === "conicFeature"
                ? `p:${object.feature}`
                : object.kind === "conicLine"
                  ? `l:${object.feature}`
                  : "",
            ),
        );
        const created = [
          ...pointFeatures
            .filter((feature) => !existing.has(`p:${feature}`))
            .map((feature) => conicFeaturePointOf(conicId, feature)),
          ...lineFeatures
            .filter((feature) => !existing.has(`l:${feature}`))
            .map((feature) => conicLineOf(conicId, feature)),
        ];
        if (created.length === 0) {
          context.setStatus("All features already exist");
          return true;
        }
        context.commit(addObjects(document, created));
        context.setStatus(PROMPTS[id]);
        return true;
      }

      if (id === "parabola3") {
        const anchor = resolveAnchorPoint(info, context);
        if (picked.includes(anchor.pointId)) return true;
        picked.push(anchor.pointId);
        if (picked.length < 3) {
          context.commit(anchor.document);
          context.setStatus(
            picked.length === 1
              ? "Parabola (3 points): click the second point"
              : "Parabola (3 points): click the third point",
          );
          return true;
        }
        const p1 = pointPosition(anchor.document, picked[0]);
        const p2 = pointPosition(anchor.document, picked[1]);
        const p3 = pointPosition(anchor.document, picked[2]);
        if (!p1 || !p2 || !p3 || !parabolaThroughPoints(p1, p2, p3)) {
          reset();
          context.setStatus("No parabola: points must have distinct x coordinates");
          return true;
        }
        context.commit(
          addObject(anchor.document, threePointParabolaOf(picked[0], picked[1], picked[2])),
        );
        reset();
        context.setStatus(PROMPTS[id]);
        return true;
      }

      if (id === "ellipse" || id === "hyperbola") {
        const anchor = resolveAnchorPoint(info, context);
        if (picked.includes(anchor.pointId)) return true;
        picked.push(anchor.pointId);
        if (picked.length < 3) {
          context.commit(anchor.document);
          context.setStatus(
            picked.length === 1
              ? `${id === "ellipse" ? "Ellipse" : "Hyperbola"}: click focus 2`
              : `${id === "ellipse" ? "Ellipse" : "Hyperbola"}: click a point on the curve`,
          );
          return true;
        }
        const candidate = conicOf(id, {
          focus1: picked[0],
          focus2: picked[1],
          pointOnCurve: picked[2],
        });
        const staged = addObject(anchor.document, candidate);
        if (!resolveConic(staged, candidate.id)) {
          reset();
          context.setStatus(
            id === "ellipse"
              ? "No ellipse: the point lies between the foci"
              : "No hyperbola through this point with these foci",
          );
          return true;
        }
        context.commit(staged);
        reset();
        context.setStatus(PROMPTS[id]);
        return true;
      }

      if (id === "parabola" || id === "eccentric") {
        if (picked.length === 0) {
          const anchor = resolveAnchorPoint(info, context);
          picked.push(anchor.pointId);
          context.commit(anchor.document);
          context.setStatus(
            id === "parabola"
              ? "Parabola: click the directrix line"
              : "Conic: click the directrix line",
          );
          return true;
        }
        const directrix = nearestLinearShape(info.position, document, tolerance());
        if (!directrix) {
          context.setStatus("Click a line, ray or segment as the directrix");
          return true;
        }
        if (id === "parabola") {
          const candidate = conicOf("parabola", { focus: picked[0], directrix });
          const staged = addObject(document, candidate);
          if (!resolveConic(staged, candidate.id)) {
            reset();
            context.setStatus("No parabola: the focus lies on the directrix");
            return true;
          }
          context.commit(staged);
        } else {
          const raw = window.prompt(
            "Eccentricity (0<e<1 ellipse, 1 parabola, >1 hyperbola)",
            "0.6",
          );
          if (raw === null) {
            reset();
            context.setStatus(PROMPTS[id]);
            return true;
          }
          const eccentricity = Number(raw);
          if (!Number.isFinite(eccentricity) || eccentricity <= 0) {
            context.setStatus("Invalid eccentricity");
            reset();
            return true;
          }
          const candidate = conicOf("eccentric", { focus: picked[0], directrix, eccentricity });
          const staged = addObject(document, candidate);
          if (!resolveConic(staged, candidate.id)) {
            reset();
            context.setStatus("No conic: the focus lies on the directrix");
            return true;
          }
          context.commit(staged);
        }
        reset();
        context.setStatus(PROMPTS[id]);
        return true;
      }

      return true;
    },
    pointerMove(info: PointerInfo) {
      if (picked.length === 0) return;
      const document = context.getDocument();
      const first = pointPosition(document, picked[0]);
      if (!first) {
        reset();
        return;
      }
      const cursor = context.snap(info).position;
      if (picked.length === 1) {
        context.controller.setPreview("segment", first, cursor);
        return;
      }
      const second = pointPosition(document, picked[1]);
      if (!second) {
        reset();
        return;
      }
      context.controller.setPolygonPreview([first, second], cursor);
    },
    pointerUp(_info: PointerInfo) {},
  };
}
