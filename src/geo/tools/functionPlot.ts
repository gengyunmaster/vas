import type { PointerInfo, Tool, ToolContext, ToolId } from "./types";

type PlotToolId = Extract<ToolId, "functionPlot" | "parametric">;

const PROMPTS: Record<PlotToolId, string> = {
  functionPlot: "Function: enter f(x) in the dialog (LaTeX supported)",
  parametric: "Parametric: enter x(t) and y(t) in the dialog (LaTeX supported)",
};

export function createPlotTool(id: PlotToolId, context: ToolContext): Tool {
  const dialogKind = id === "functionPlot" ? ("function" as const) : ("parametric" as const);
  return {
    id,
    activate() {
      context.setStatus(PROMPTS[id]);
      context.openDialog(dialogKind);
    },
    deactivate() {
      context.setStatus("");
    },
    cancel() {},
    pointerDown(_info: PointerInfo) {
      context.openDialog(dialogKind);
      return true;
    },
    pointerMove(_info: PointerInfo) {},
    pointerUp(_info: PointerInfo) {},
  };
}
