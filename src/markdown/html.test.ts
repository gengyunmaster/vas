import { beforeAll, describe, expect, it } from "vitest";
import { parseMarkdown } from "./blocks";
import { ensureHighlight } from "./highlight";
import { renderBlocksHtml } from "./html";

const noImages = () => null;

describe("renderBlocksHtml code blocks", () => {
  beforeAll(async () => {
    await ensureHighlight();
  });

  it("renders plain code blocks escaped and colorless", () => {
    const html = renderBlocksHtml(parseMarkdown('```\na <b> & "c"\n```'), noImages);
    expect(html).toBe('<pre class="md-code">a &lt;b&gt; &amp; &quot;c&quot;</pre>');
  });

  it("wraps manual color segments in colored spans and escapes them", () => {
    const html = renderBlocksHtml(parseMarkdown("```\n{#ff0000|<x>} tail\n```"), noImages);
    expect(html).toBe(
      '<pre class="md-code"><span style="color: #ff0000">&lt;x&gt;</span> tail</pre>',
    );
  });

  it("highlights fenced code with a language using the light palette", () => {
    const html = renderBlocksHtml(parseMarkdown("```js\nlet x\n```"), noImages);
    expect(html).toBe('<pre class="md-code"><span style="color: #a626a4">let</span> x</pre>');
  });

  it("uses the dark palette on dark paper", () => {
    const html = renderBlocksHtml(parseMarkdown("```js\nlet x\n```"), noImages, true);
    expect(html).toBe('<pre class="md-code"><span style="color: #c678dd">let</span> x</pre>');
  });

  it("keeps fences without a language monochrome", () => {
    const html = renderBlocksHtml(parseMarkdown("```\nlet x\n```"), noImages);
    expect(html).toBe('<pre class="md-code">let x</pre>');
  });
});
