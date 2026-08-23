// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test } from "vitest";
import App from "../App";
import { addObject, axisSystemOf, createDocument, freePoint, serializeDocument } from "../model";
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

async function mount(documentJson: string | null, paperColor = "#ffffff"): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <App
        paperColor={paperColor}
        initialDocument={documentJson}
        onEmbed={() => {}}
        onCancel={() => {}}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
}

test("renders the editor chrome for an empty document", async () => {
  await mount(null);
  expect(container.querySelector(".embed-button")?.textContent).toContain("Embed");
  expect(container.textContent).toContain("Point");
  expect(container.textContent).toContain("No objects yet");
});

test("lists the document's objects in the inspector", async () => {
  let document = createDocument();
  const origin = freePoint(0, 0);
  const unit = freePoint(1, 0);
  document = addObject(document, origin);
  document = addObject(document, unit);
  document = addObject(document, axisSystemOf(origin.id, unit.id));
  await mount(serializeDocument(document));
  expect(container.textContent).toContain("Objects (3)");
});

test("paints the board host with the paper color", async () => {
  await mount(null, "#003423");
  const host = container.querySelector<HTMLElement>(".board-host");
  expect(host?.style.backgroundColor).toBe("rgb(0, 52, 35)");
});
