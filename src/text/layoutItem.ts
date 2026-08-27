// Lays out one text item with the shared engine and refreshes the height
// cache, so sync consumers (lasso, bounds) converge on the export truth.
import { renderLatex } from "../geo/latexSvg";
import { parseMarkdown } from "../markdown/blocks";
import type { TextItem } from "../model/textItem";
import { type ImageSizeResolver, layoutBlocks, type MeasureFn, type TextLayout } from "./layout";
import { noteTextItemHeight } from "./textHeight";

export async function layoutTextItem(
  item: TextItem,
  measure: MeasureFn,
  resolveImageSize: ImageSizeResolver,
): Promise<TextLayout> {
  const layout = await layoutBlocks(parseMarkdown(item.markdown), {
    width: item.width,
    fontSize: item.fontSize,
    color: item.color,
    measure,
    resolveMath: (latex, display) => renderLatex(latex, display),
    resolveImageSize,
  });
  noteTextItemHeight(item, layout.height);
  return layout;
}
