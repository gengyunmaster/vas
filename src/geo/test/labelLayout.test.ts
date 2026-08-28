import { expect, test } from "vitest";
import { pickLabelSpot, rectAround, rectSeparation } from "../board/labelLayout";

const VIEW = { width: 800, height: 600 };

test("rectSeparation is zero for overlapping or touching rects", () => {
  const a = rectAround([100, 100], 20, 10);
  expect(rectSeparation(a, rectAround([110, 100], 20, 10))).toBe(0);
  expect(rectSeparation(a, rectAround([140, 100], 20, 10))).toBe(0);
});

test("rectSeparation measures the gap between separated rects", () => {
  const a = rectAround([100, 100], 20, 10);
  expect(rectSeparation(a, rectAround([170, 100], 20, 10))).toBe(30);
  // Ranges overlap horizontally, so only the 20px vertical gap counts.
  expect(rectSeparation(a, rectAround([130, 140], 20, 10))).toBe(20);
});

test("pickLabelSpot prefers the free candidate with the most clearance", () => {
  const spot = pickLabelSpot(
    [
      { center: [100, 100], clearance: 100 },
      { center: [400, 300], clearance: 300 },
    ],
    30,
    10,
    [],
    VIEW,
    8,
    6,
  );
  expect(spot).toEqual([400, 300]);
});

test("pickLabelSpot moves off an obstacle even at lower clearance", () => {
  const obstacle = rectAround([400, 300], 30, 10);
  const spot = pickLabelSpot(
    [
      { center: [410, 300], clearance: 300 },
      { center: [400, 500], clearance: 100 },
    ],
    30,
    10,
    [obstacle],
    VIEW,
    8,
    6,
  );
  expect(spot).toEqual([400, 500]);
});

test("pickLabelSpot treats a gap of at least `gap` as free", () => {
  const obstacle = rectAround([400, 300], 30, 10);
  // Rect edges are exactly 6px apart vertically.
  const spot = pickLabelSpot(
    [{ center: [400, 332], clearance: 268 }],
    30,
    10,
    [obstacle],
    VIEW,
    8,
    6,
  );
  expect(spot).toEqual([400, 332]);
});

test("pickLabelSpot falls back to the least-crowded candidate", () => {
  const obstacle = rectAround([400, 300], 30, 10);
  const spot = pickLabelSpot(
    [
      { center: [405, 300], clearance: 295 },
      { center: [400, 330], clearance: 270 },
    ],
    30,
    10,
    [obstacle],
    VIEW,
    8,
    6,
  );
  expect(spot).toEqual([400, 330]);
});

test("pickLabelSpot rejects candidates that would leave the canvas", () => {
  expect(pickLabelSpot([{ center: [5, 300], clearance: 5 }], 30, 10, [], VIEW, 8, 6)).toBeNull();
  const spot = pickLabelSpot(
    [
      { center: [5, 300], clearance: 5 },
      { center: [400, 300], clearance: 300 },
    ],
    30,
    10,
    [],
    VIEW,
    8,
    6,
  );
  expect(spot).toEqual([400, 300]);
});
