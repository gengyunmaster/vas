import { expect, test } from "@playwright/test";
import { darkPixelCount, downloadExport, drawStroke, openBoard, openSettings, pageStrokes, selectPenSize } from "./helpers";

const STROKE = [
  { x: 300, y: 300 },
  { x: 340, y: 320 },
  { x: 380, y: 330 },
  { x: 420, y: 320 },
  { x: 460, y: 300 },
];
const STROKE_BOX = { x: 270, y: 270, w: 220, h: 100 };

test.beforeEach(async ({ page }) => {
  await openBoard(page);
});

test("creates and opens a notebook on first launch", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Eraser" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.locator(".page-indicator")).toHaveText("1 / 1");
});

test("draws a pen stroke and renders ink", async ({ page }) => {
  await selectPenSize(page, "4.5");
  await drawStroke(page, STROKE);
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBeGreaterThan(100);
});

test("eraser removes a stroke", async ({ page }) => {
  await selectPenSize(page, "4.5");
  await drawStroke(page, STROKE);
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Eraser" }).click();
  await drawStroke(page, [
    { x: 260, y: 310 },
    { x: 480, y: 315 },
  ]);
  await page.mouse.move(60, 600);
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBe(0);
});

test("undo and redo restore strokes", async ({ page }) => {
  await selectPenSize(page, "4.5");
  await drawStroke(page, STROKE);
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBeGreaterThan(100);
  await openSettings(page);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBe(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => darkPixelCount(page, STROKE_BOX)).toBeGreaterThan(100);
});

test("add page appends a page", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Add page" }).click();
  await expect(page.locator(".page-indicator")).toHaveText("2 / 2");
});

test("text tool creates a text item", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.mouse.click(400, 320);
  const editor = page.locator(".text-editor textarea");
  await expect(editor).toBeVisible();
  await editor.fill("hello **world**");
  await page.keyboard.press("Escape");
  await expect(page.locator(".text-item")).toContainText("hello world");
});

test("exports current page as PNG", async ({ page }) => {
  await drawStroke(page, STROKE);
  const bytes = await downloadExport(page, "This page", "PNG");
  expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});

test("exports current page as SVG", async ({ page }) => {
  await drawStroke(page, STROKE);
  const bytes = await downloadExport(page, "This page", "SVG");
  expect(bytes.toString("utf8")).toContain("<svg");
});

test("exports whole notebook as PDF", async ({ page }) => {
  await drawStroke(page, STROKE);
  const bytes = await downloadExport(page, "Notebook", "PDF");
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

test("shows an error banner for unhandled errors", async ({ page }) => {
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" }));
  });
  const banner = page.locator(".error-banner");
  await expect(banner).toContainText("Something went wrong");
  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".error-banner")).toHaveCount(0);
});

function roughRectTrace(): { x: number; y: number }[] {
  const rect: { x: number; y: number }[] = [];
  const corners = [
    { x: 250, y: 200 },
    { x: 500, y: 205 },
    { x: 495, y: 400 },
    { x: 255, y: 395 },
    { x: 250, y: 200 },
  ];
  for (let e = 0; e < corners.length - 1; e++) {
    const a = corners[e];
    const b = corners[e + 1];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const wobble = Math.sin((e * 13 + i) * 2.3) * 4;
      rect.push({ x: a.x + (b.x - a.x) * t + wobble, y: a.y + (b.y - a.y) * t - wobble });
    }
  }
  return rect;
}

test("draw-and-hold snaps a rough rectangle into a shape", async ({ page }) => {
  const rect = roughRectTrace();
  await page.mouse.move(rect[0].x, rect[0].y);
  await page.mouse.down();
  for (const p of rect.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect.poll(async () => (await pageStrokes(page))[0]?.shape).toBe("rect");
});

test("a snapped rectangle ignores further pointer movement", async ({ page }) => {
  const rect = roughRectTrace();
  await page.mouse.move(rect[0].x, rect[0].y);
  await page.mouse.down();
  for (const p of rect.slice(1)) await page.mouse.move(p.x, p.y, { steps: 2 });
  await page.waitForTimeout(500);
  await page.mouse.move(rect[0].x + 6, rect[0].y + 6, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => (await pageStrokes(page))[0]?.shape).toBe("rect");
  const stroke = (await pageStrokes(page))[0];
  if (!stroke) throw new Error("expected a committed stroke");
  const [a, b] = stroke.points as { x: number; y: number }[];
  expect(Math.abs(b.x - a.x)).toBeGreaterThan(100);
  expect(Math.abs(b.y - a.y)).toBeGreaterThan(80);
});

test("a quick stroke stays freehand", async ({ page }) => {
  await drawStroke(page, STROKE);
  await expect.poll(async () => (await pageStrokes(page))[0]?.shape).toBeUndefined();
});

test("back to notebooks lists the notebook", async ({ page }) => {
  await page.getByRole("button", { name: "Back to notebooks" }).click();
  await expect(page.getByText("My Notebook")).toBeVisible();
  await expect(page.getByRole("button", { name: "New notebook" })).toBeVisible();
});
