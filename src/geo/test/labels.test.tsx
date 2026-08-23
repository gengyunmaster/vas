// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import App from "../App";
import {
  addObject,
  axisSystemOf,
  createDocument,
  freePoint,
  functionPlotOf,
  serializeDocument,
  variableAt,
} from "../model";
import "./setup";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  container.remove();
});

async function mount(documentJson: string | null): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <App
        paperColor="#ffffff"
        initialDocument={documentJson}
        onEmbed={() => {}}
        onCancel={() => {}}
      />,
    );
    // Let lazy KaTeX / compute-engine chunks resolve and effects settle.
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

function overlayTexts(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".JXGtext")].map(
    (node) => node.textContent ?? "",
  );
}

test("axis x/y labels render on the live board", async () => {
  let document = createDocument();
  const origin = freePoint(0, 0);
  const unit = freePoint(1, 0);
  document = addObject(document, origin);
  document = addObject(document, unit);
  document = addObject(document, axisSystemOf(origin.id, unit.id));
  await mount(serializeDocument(document));
  const texts = overlayTexts();
  expect(texts.some((text) => text.includes("x"))).toBe(true);
  expect(texts.some((text) => text.includes("y"))).toBe(true);
});

test("variable value text renders on the live board", async () => {
  let document = createDocument();
  document = addObject(document, variableAt(2, [2, 2]));
  await mount(serializeDocument(document));
  const texts = overlayTexts().filter((text) => text.trim() !== "");
  expect(texts.length).toBeGreaterThan(0);
});

test("function plot expression label renders on the live board", async () => {
  let document = createDocument();
  document = addObject(document, functionPlotOf("x^2", undefined));
  await mount(serializeDocument(document));
  const texts = overlayTexts().filter((text) => text.trim() !== "");
  expect(texts.length).toBeGreaterThan(0);
});
