import { expect, type Page } from "@playwright/test";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function openBoard(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pen", exact: true })).toBeVisible();
}

export async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
}

export async function drawStroke(page: Page, points: { x: number; y: number }[]) {
  const [first, ...rest] = points;
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up();
}

export function darkPixelCount(page: Page, box: Box): Promise<number> {
  return page.evaluate((b) => {
    let dark = 0;
    for (const canvas of document.querySelectorAll("canvas")) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.max(0, Math.floor((b.x - rect.left) * scaleX));
      const y = Math.max(0, Math.floor((b.y - rect.top) * scaleY));
      const w = Math.min(canvas.width - x, Math.ceil(b.w * scaleX));
      const h = Math.min(canvas.height - y, Math.ceil(b.h * scaleY));
      if (w <= 0 || h <= 0) continue;
      const data = ctx.getImageData(x, y, w, h).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 100 && data[i] < 150 && data[i + 1] < 150 && data[i + 2] < 150) dark++;
      }
    }
    return dark;
  }, box);
}

export async function selectPenSize(page: Page, size: string) {
  await openSettings(page);
  await page.getByTitle(`Size ${size}`, { exact: true }).click();
  await page.getByRole("button", { name: "Settings" }).click();
}

export async function pageStrokes(page: Page): Promise<{ shape?: string; points: unknown[] }[]> {
  return page.evaluate(async () => {
    const req = indexedDB.open("vas");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction("pages", "readonly");
    const pages = await new Promise<{ strokes?: { shape?: string; points: unknown[] }[] }[]>((resolve, reject) => {
      const q = tx.objectStore("pages").getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    db.close();
    return pages.flatMap((p) => p.strokes ?? []);
  });
}

export async function downloadExport(page: Page, scope: "This page" | "Notebook", format: "PDF" | "SVG" | "PNG") {
  await openSettings(page);
  await page.getByRole("button", { name: scope, exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: format, exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
