import { resolveAnchorPoint } from "./anchor";
import type { PointerInfo, Tool, ToolContext } from "./types";

export class PointTool implements Tool {
  readonly id = "point" as const;
  private readonly context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  deactivate(): void {}

  pointerDown(info: PointerInfo): boolean {
    const anchor = resolveAnchorPoint(info, this.context);
    this.context.commit(anchor.document);
    return true;
  }

  pointerMove(_info: PointerInfo): void {}

  pointerUp(_info: PointerInfo): void {}

  cancel(): void {}
}
