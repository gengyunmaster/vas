import { isDarkColor } from "../model/color";
import { PLACEMENT_MARGIN } from "../model/page";
import { createTextItem, MAX_TEXT_MARKDOWN_LENGTH, TEXT_PAGE_MARGIN } from "../model/textItem";
import { toast } from "../store/toasts";
import { useBoardStore } from "../store/useBoardStore";
import { layoutTextItem, naturalImageSize } from "../text/layoutItem";
import { createTextMeasurer } from "../text/measure";

// Clipboard text becomes a new text box at the top-left margin, mirroring how
// pasted elements land. The box must fit the page at the default font size —
// otherwise nothing is inserted, matching the editor's overflow rejection.
export async function pastePlainText(raw: string): Promise<void> {
  const state = useBoardStore.getState();
  const page = state.pages[state.viewPageIndex] ?? state.pages[0];
  if (!page) return;
  const markdown = raw.replace(/\r\n?/g, "\n").trim();
  if (!markdown) return;
  if (markdown.length > MAX_TEXT_MARKDOWN_LENGTH) {
    toast("Text is too long to paste.");
    return;
  }
  const item = createTextItem(
    PLACEMENT_MARGIN,
    PLACEMENT_MARGIN,
    state.textFontSize,
    state.color,
    page.width,
    page.height,
  );
  item.markdown = markdown;
  const measure = await createTextMeasurer();
  const layout = await layoutTextItem(
    item,
    measure,
    naturalImageSize,
    isDarkColor(page.paperColor),
  );
  if (item.y + layout.height > page.height - TEXT_PAGE_MARGIN) {
    toast("Text doesn't fit on this page — enlarge the text box or reduce the font size.");
    return;
  }
  useBoardStore.getState().insertTextItem(item);
}
