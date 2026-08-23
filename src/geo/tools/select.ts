import { PICK_TOLERANCE_PX } from "./constants";
import type { PointerInfo, Tool, ToolContext } from "./types";

export class SelectTool implements Tool {
  readonly id = "select" as const;
  private readonly context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  deactivate(): void {}

  pointerDown(info: PointerInfo): boolean {
    const tolerance = this.context.controller.pixelsToUnits(PICK_TOLERANCE_PX);
    const hit = this.context.controller.pickObject(
      info.position,
      this.context.getDocument(),
      tolerance,
    );
    this.context.setSelected(hit);
    return false;
  }

  pointerMove(_info: PointerInfo): void {}

  pointerUp(_info: PointerInfo): void {}

  cancel(): void {
    this.context.setSelected(null);
  }
}
