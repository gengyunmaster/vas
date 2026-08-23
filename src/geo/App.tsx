import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { isDarkColor } from "../model/color";
import { BoardController } from "./board";
import { applyBoardTheme, applyPaperPalette } from "./board/palette";
import { debugLog, isDebugEnabled } from "./debug";
import { useDocumentHistory } from "./history";
import type { Animation, ObjectId, ObjectStyle, XY } from "./model";
import {
  addObject,
  calculationAt,
  enforceLocks,
  ensureComputeEngine,
  evaluateCalculationExpression,
  functionPlotOf,
  listObjects,
  movePoint,
  moveTextPosition,
  objectNameError,
  parametricCurveOf,
  parseDocument,
  polygonVerticesOf,
  removeObject,
  renameObject,
  resolveConic,
  serializeDocument,
  setCalculationExpression,
  setObjectHidden,
  setObjectTraced,
  setPointLocked,
  setValueLock,
  setVariableRange,
  setVariableValue,
  slidePoint,
  updateAnimationSettings,
  updateObjectStyle,
  updatePlotExpressions,
  updatePointDisplay,
  variableScope,
} from "./model";
import { resolveSnap } from "./snapping";
import type { PointerInfo, ToolContext, ToolId } from "./tools";
import { SNAP_TOLERANCE_PX, ToolManager } from "./tools";
import type { CustomToolDef } from "./tools/customTools";
import {
  buildToolDefinition,
  isCustomToolDef,
  loadCustomTools,
  saveCustomTools,
} from "./tools/customTools";
import { DebugPanel } from "./ui/DebugPanel";
import { composeBoardSvg, rasterizeBoard } from "./ui/export";
import {
  downloadBlob,
  downloadText,
  parseDocumentSafely,
  pickTextFile,
  timestampedFilename,
} from "./ui/files";
import { Inspector } from "./ui/Inspector";
import { MathDialog } from "./ui/MathDialog";
import { Toolbar } from "./ui/Toolbar";

export interface GeoEmbedPayload {
  svg: string;
  document: string;
}

interface GeoEditorProps {
  paperColor: string;
  initialDocument: string | null;
  onEmbed: (payload: GeoEmbedPayload) => void;
  onCancel: () => void;
}

export default function App({ paperColor, initialDocument, onEmbed, onCancel }: GeoEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BoardController | null>(null);
  const managerRef = useRef<ToolManager | null>(null);
  const [activeTool, setActiveTool] = useState<string>("select");
  const [customTools, setCustomTools] = useState<CustomToolDef[]>(loadCustomTools);
  const [embedding, setEmbedding] = useState(false);
  const [initialDoc] = useState(() => parseDocumentSafely(initialDocument));
  const {
    document,
    canUndo,
    canRedo,
    commit,
    reset,
    undo,
    redo,
    beginTransient,
    updateTransient,
    endTransient,
  } = useDocumentHistory(initialDoc);
  const [selectedId, setSelectedId] = useState<ObjectId | null>(null);
  const [status, setStatus] = useState("");
  const [playingId, setPlayingId] = useState<ObjectId | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [mathDialog, setMathDialog] = useState<{
    kind: "function" | "parametric" | "calculation";
    position?: XY;
  } | null>(null);
  const runnerRef = useRef<{ raf: number; id: ObjectId } | null>(null);

  useEffect(() => {
    ensureComputeEngine()
      .then(() => controllerRef.current?.sync(documentRef.current))
      .catch(() => {});
  }, []);
  const documentRef = useRef(document);
  const selectedRef = useRef(selectedId);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    documentRef.current = document;
    controllerRef.current?.sync(document);
  }, [document]);

  useEffect(() => {
    if (selectedId && !document.objects[selectedId]) setSelectedId(null);
  }, [document, selectedId]);

  useEffect(() => {
    applyPaperPalette(paperColor, isDarkColor(paperColor));
    controllerRef.current?.sync(documentRef.current);
    return () => applyBoardTheme("light");
  }, [paperColor]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const controller = new BoardController(host, {
      getDocument: () => documentRef.current,
      onDragStart: beginTransient,
      onDragEnd: endTransient,
      onPointDragged: (id, x, y) =>
        updateTransient((current) => enforceLocks(movePoint(current, id, x, y), id)),
      onPointSlid: (id, value, branch) =>
        updateTransient((current) => enforceLocks(slidePoint(current, id, value, branch), id)),
      onTextMoved: (id, position) =>
        updateTransient((current) => moveTextPosition(current, id, position)),
      onVariableSlid: (id, value) =>
        updateTransient((current) => enforceLocks(setVariableValue(current, id, value))),
    });
    const context: ToolContext = {
      controller,
      getDocument: () => documentRef.current,
      getSelected: () => selectedRef.current,
      commit: (next) => {
        debugLog(`commit objects=${Object.keys(next.objects).length}`);
        commit(next);
      },
      setSelected: setSelectedId,
      setStatus,
      openDialog: (kind, position) => setMathDialog({ kind, position }),
      snap: (info) =>
        resolveSnap({
          pointer: info.position,
          ctrlKey: info.ctrlKey,
          shiftKey: info.shiftKey,
          document: documentRef.current,
          tolerance: controller.pixelsToUnits(SNAP_TOLERANCE_PX),
        }),
    };
    controllerRef.current = controller;
    managerRef.current = new ToolManager(context);
    controller.setLayoutListener(() => setLayoutTick((tick) => tick + 1));
    controller.sync(documentRef.current);
    return () => {
      controllerRef.current = null;
      managerRef.current = null;
      controller.setLayoutListener(null);
      controller.destroy();
    };
  }, [beginTransient, endTransient, updateTransient, commit]);

  useEffect(() => {
    controllerRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (activeTool.startsWith("custom:")) {
      const name = activeTool.slice("custom:".length);
      const def = customTools.find((tool) => tool.name === name);
      if (def) managerRef.current?.activateCustom(def);
      return;
    }
    managerRef.current?.setActive(activeTool as ToolId);
  }, [activeTool, customTools]);

  useEffect(() => {
    saveCustomTools(customTools);
  }, [customTools]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mathDialog) {
        if (event.key === "Escape") setMathDialog(null);
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        tag === "math-field" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.key === "Escape") {
        managerRef.current?.cancel();
        return;
      }
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key.toLowerCase() === "h" && !command && selectedId) {
        const object = documentRef.current.objects[selectedId];
        if (object) commit(setObjectHidden(documentRef.current, selectedId, !object.hidden));
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        commit(removeObject(documentRef.current, selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, undo, redo, commit, mathDialog]);

  const saveFile = () => {
    downloadText(
      timestampedFilename("webgeo.json"),
      serializeDocument(documentRef.current),
      "application/json",
    );
  };

  const openFile = async () => {
    try {
      const text = await pickTextFile(".json,application/json");
      if (text === null) return;
      reset(parseDocument(text));
      setSelectedId(null);
    } catch (error) {
      window.alert(
        `Could not open file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const exportSvg = async () => {
    const controller = controllerRef.current;
    const host = controller?.hostElement();
    if (!controller || !host) return;
    downloadText(
      timestampedFilename("svg"),
      await composeBoardSvg(host, { overlays: controller.latexOverlays() }),
      "image/svg+xml",
    );
  };

  const exportPng = async () => {
    const controller = controllerRef.current;
    const host = controller?.hostElement();
    if (!controller || !host) return;
    try {
      const blob = await rasterizeBoard(host, 2, { overlays: controller.latexOverlays() });
      if (blob) downloadBlob(timestampedFilename("png"), blob);
      else window.alert("PNG export failed in this browser");
    } catch {
      window.alert("PNG export failed in this browser");
    }
  };

  const handleEmbed = async () => {
    const controller = controllerRef.current;
    const host = controller?.hostElement();
    if (!controller || !host || embedding) return;
    setEmbedding(true);
    try {
      const svg = await composeBoardSvg(host, {
        background: null,
        overlays: controller.latexOverlays(),
      });
      onEmbed({ svg, document: serializeDocument(documentRef.current) });
    } catch (error) {
      console.error("Embed failed", error);
      setStatus("Embed failed in this browser");
      setEmbedding(false);
    }
  };

  const handleRename = (id: ObjectId, name: string) => {
    const error = objectNameError(documentRef.current, id, name);
    if (error) {
      setStatus(error);
      return;
    }
    commit(renameObject(documentRef.current, id, name));
  };

  const handleSetHidden = (id: ObjectId, hidden: boolean) => {
    commit(setObjectHidden(documentRef.current, id, hidden));
  };

  const handleUpdateStyle = (id: ObjectId, patch: ObjectStyle) => {
    commit(updateObjectStyle(documentRef.current, id, patch));
  };

  const handleSetVariableValue = (id: ObjectId, value: number) => {
    commit(enforceLocks(setVariableValue(documentRef.current, id, value)));
  };

  const handleSetVariableRange = (id: ObjectId, min: number | null, max: number | null) => {
    commit(enforceLocks(setVariableRange(documentRef.current, id, min, max)));
  };

  const handleMovePoint = (id: ObjectId, x: number, y: number) => {
    commit(enforceLocks(movePoint(documentRef.current, id, x, y), id));
  };

  const handleSetValueLock = (id: ObjectId, locked: number | null) => {
    commit(enforceLocks(setValueLock(documentRef.current, id, locked)));
  };

  const handleSetPointLocked = (id: ObjectId, locked: boolean) => {
    commit(setPointLocked(documentRef.current, id, locked));
  };

  const handleSetExpression = (id: ObjectId, expression: string) => {
    commit(setCalculationExpression(documentRef.current, id, expression));
  };

  const handleSetTraced = (id: ObjectId, traced: boolean) => {
    commit(setObjectTraced(documentRef.current, id, traced));
  };

  const handleUpdatePointDisplay = (
    id: ObjectId,
    patch: { showCoordinates?: boolean; coordinateAxes?: ObjectId | null | "auto" },
  ) => {
    commit(updatePointDisplay(documentRef.current, id, patch));
  };

  const stopAnimation = () => {
    if (!runnerRef.current) return;
    cancelAnimationFrame(runnerRef.current.raf);
    runnerRef.current = null;
    setPlayingId(null);
    endTransient();
  };

  useEffect(
    () => () => {
      if (runnerRef.current) cancelAnimationFrame(runnerRef.current.raf);
    },
    [],
  );

  const playAnimation = (id: ObjectId) => {
    if (runnerRef.current?.id === id) {
      stopAnimation();
      return;
    }
    stopAnimation();
    const document = documentRef.current;
    const animation = document.objects[id];
    if (animation?.kind !== "animation") return;

    const drivers: Animation[] = [];
    const toggles: ObjectId[] = [];
    const visited = new Set<ObjectId>();
    const collect = (entry: Animation) => {
      if (visited.has(entry.id)) return;
      visited.add(entry.id);
      if (entry.variant === "driver" || entry.variant === "variable") drivers.push(entry);
      else if (entry.variant === "toggle" && entry.target) toggles.push(entry.target);
      else if (entry.variant === "group") {
        for (const childId of entry.children ?? []) {
          const child = document.objects[childId];
          if (child?.kind === "animation") collect(child);
        }
      }
    };
    collect(animation);

    beginTransient();
    if (toggles.length > 0) {
      updateTransient((current) =>
        toggles.reduce(
          (next, target) => setObjectHidden(next, target, !next.objects[target]?.hidden),
          current,
        ),
      );
    }
    if (drivers.length === 0) {
      endTransient();
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      if (!documentRef.current.objects[id]) {
        stopAnimation();
        return;
      }
      const elapsed = (now - start) / 1000;
      let allDone = true;
      const pending: [ObjectId, number][] = [];
      for (const driver of drivers) {
        const duration = driver.duration ?? 3;
        const mode = driver.mode ?? "pingpong";
        const phase = elapsed / duration;
        let parameter: number;
        if (mode === "loop") {
          parameter = phase % 1;
          allDone = false;
        } else if (mode === "once") {
          parameter = Math.min(phase, 1);
          if (phase < 1) allDone = false;
        } else {
          const cycle = phase % 2;
          parameter = cycle <= 1 ? cycle : 2 - cycle;
          allDone = false;
        }
        if (driver.target) pending.push([driver.target, parameter]);
      }
      updateTransient((current) => {
        let next = current;
        for (const [targetId, parameter] of pending) {
          const target = next.objects[targetId];
          if (target?.kind === "variable") {
            if (target.min !== undefined && target.max !== undefined) {
              next = setVariableValue(
                next,
                targetId,
                target.min + (target.max - target.min) * parameter,
              );
            }
            continue;
          }
          if (target?.kind !== "point") continue;
          if (target.role === "onLinear") {
            next = slidePoint(next, targetId, parameter);
          } else if (target.role === "onCircle") {
            next = slidePoint(next, targetId, 2 * Math.PI * parameter);
          } else if (target.role === "onPolygon") {
            const edges = polygonVerticesOf(next, target.host)?.length ?? 0;
            if (edges > 0) next = slidePoint(next, targetId, parameter * edges);
          } else if (target.role === "onConic") {
            const params = resolveConic(next, target.host);
            if (params?.type === "ellipse") {
              next = slidePoint(next, targetId, 2 * Math.PI * parameter);
            } else if (params?.type === "parabola") {
              next = slidePoint(next, targetId, (parameter * 2 - 1) * 8 * params.a);
            } else if (params?.type === "hyperbola") {
              next = slidePoint(next, targetId, (parameter * 2 - 1) * 2);
            }
          }
        }
        return enforceLocks(next);
      });
      if (allDone) {
        stopAnimation();
        return;
      }
      runnerRef.current = { raf: requestAnimationFrame(tick), id };
    };
    runnerRef.current = { raf: requestAnimationFrame(tick), id };
    setPlayingId(id);
  };

  const handleAnimationClick = (id: ObjectId) => {
    if (managerRef.current?.animationClicked(id)) return;
    playAnimation(id);
  };

  const handleUpdateAnimation = (
    id: ObjectId,
    patch: { duration?: number; mode?: Animation["mode"] },
  ) => {
    commit(updateAnimationSettings(documentRef.current, id, patch));
  };

  const handleUpdatePlot = (
    id: ObjectId,
    patch: {
      latex?: string;
      xLatex?: string;
      yLatex?: string;
      tMin?: number;
      tMax?: number;
      axis?: ObjectId | null;
      xMin?: number | null;
      xMax?: number | null;
    },
  ) => {
    commit(updatePlotExpressions(documentRef.current, id, patch));
  };

  const handleSelectTool = (tool: ToolId) => {
    if (tool === activeTool) {
      managerRef.current?.setActive(tool, true);
      return;
    }
    setActiveTool(tool);
  };

  const handleSelectCustom = (name: string) => {
    if (activeTool === `custom:${name}`) {
      const def = customTools.find((tool) => tool.name === name);
      if (def) managerRef.current?.activateCustom(def);
      return;
    }
    setActiveTool(`custom:${name}`);
  };

  const handleCreateCustom = () => {
    const selected = selectedRef.current;
    if (!selected || !documentRef.current.objects[selected]) {
      setStatus("Select the output object of the tool first");
      return;
    }
    const name = window.prompt("Tool name", "");
    if (!name?.trim()) return;
    const def = buildToolDefinition(name.trim(), documentRef.current, selected);
    if (!def) {
      setStatus("Nothing to record: select an object built from free points");
      return;
    }
    setCustomTools((current) => [...current.filter((tool) => tool.name !== def.name), def]);
    setStatus(`Custom tool "${def.name}" created (${def.givens.length} givens)`);
  };

  const handleDeleteCustom = (name: string) => {
    if (window.confirm(`Delete custom tool "${name}"?`)) {
      setCustomTools((current) => current.filter((tool) => tool.name !== name));
      if (activeTool === `custom:${name}`) setActiveTool("select");
    }
  };

  const handleExportCustom = () => {
    downloadText("webgeo-tools.json", JSON.stringify(customTools, null, 2), "application/json");
  };

  const handleImportCustom = async () => {
    try {
      const text = await pickTextFile(".json,application/json");
      if (text === null) return;
      const data: unknown = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("expected an array of tool definitions");
      const valid = data.filter(isCustomToolDef);
      setCustomTools((current) => [
        ...current.filter((tool) => !valid.some((entry) => entry.name === tool.name)),
        ...valid,
      ]);
      setStatus(`Imported ${valid.length} custom tools`);
    } catch (error) {
      window.alert(
        `Could not import tools: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const confirmMathDialog = (values: {
    latex?: string;
    expression?: string;
    xLatex?: string;
    yLatex?: string;
    tMin?: number;
    tMax?: number;
    xMin?: number;
    xMax?: number;
  }) => {
    const document = documentRef.current;
    if (!mathDialog) return;
    if (mathDialog.kind === "calculation" && values.expression) {
      commit(addObject(document, calculationAt(values.expression, mathDialog.position ?? [0, 0])));
      setStatus("Calculation placed");
    } else if (mathDialog.kind === "function" && values.latex) {
      const axes = listObjects(document, "axisSystem");
      const axis = axes.length === 1 ? axes[0].id : undefined;
      commit(addObject(document, functionPlotOf(values.latex, axis, values.xMin, values.xMax)));
      setStatus(
        axes.length === 1
          ? "Function plotted on the marked axes"
          : "Function plotted in board coordinates (create an axes system to attach)",
      );
    } else if (mathDialog.kind === "parametric" && values.xLatex && values.yLatex) {
      const axes = listObjects(document, "axisSystem");
      const axis = axes.length === 1 ? axes[0].id : undefined;
      commit(
        addObject(
          document,
          parametricCurveOf(values.xLatex, values.yLatex, values.tMin ?? 0, values.tMax ?? 1, axis),
        ),
      );
      setStatus(
        axes.length === 1
          ? "Parametric curve plotted on the marked axes"
          : "Parametric curve plotted in board coordinates (create an axes system to attach)",
      );
    }
    setMathDialog(null);
  };

  const validateCalculation = (expression: string): string | null =>
    evaluateCalculationExpression(documentRef.current, expression) === null
      ? "Expression cannot be evaluated"
      : null;

  const renderAnimationButtons = () => {
    void layoutTick;
    const controller = controllerRef.current;
    if (!controller) return null;
    return Object.values(document.objects)
      .filter(
        (object): object is Animation & { name?: string; hidden?: boolean } =>
          object.kind === "animation" && !object.hidden,
      )
      .map((animation) => {
        const [left, top] = controller.toScreen(animation.position);
        const label =
          animation.name ??
          (animation.variant === "driver" || animation.variant === "variable"
            ? "Animate"
            : animation.variant === "toggle"
              ? "Toggle"
              : "Group");
        return (
          <button
            key={animation.id}
            type="button"
            className="animation-button"
            style={{ left, top }}
            onClick={() => handleAnimationClick(animation.id)}
          >
            {playingId === animation.id ? "■ " : "▶ "}
            {label}
          </button>
        );
      });
  };

  const dispatchPointer = <T,>(
    event: ReactPointerEvent<HTMLDivElement>,
    handler: (info: PointerInfo) => T,
  ): T | undefined => {
    const controller = controllerRef.current;
    if (!controller) return undefined;
    const info = {
      position: controller.pointerPosition(event.nativeEvent),
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    };
    debugLog(
      `${event.type} usr=(${info.position[0].toFixed(2)}, ${info.position[1].toFixed(2)}) ctrl=${info.ctrlKey} shift=${info.shiftKey}`,
    );
    return handler(info);
  };

  return (
    <div className="geo">
      <Toolbar
        activeTool={activeTool}
        canUndo={canUndo}
        canRedo={canRedo}
        customTools={customTools}
        embedBusy={embedding}
        onSelect={handleSelectTool}
        onSelectCustom={handleSelectCustom}
        onCreateCustom={handleCreateCustom}
        onImportCustom={handleImportCustom}
        onExportCustom={handleExportCustom}
        onDeleteCustom={handleDeleteCustom}
        onUndo={undo}
        onRedo={redo}
        onSave={saveFile}
        onOpen={openFile}
        onExportSvg={exportSvg}
        onExportPng={exportPng}
        onClearTraces={() => controllerRef.current?.clearTraces()}
        onEmbed={() => void handleEmbed()}
        onCancel={onCancel}
      />
      <div className="main">
        <div className="board-wrap">
          <div
            ref={hostRef}
            className="board-host"
            onPointerDownCapture={(event) => {
              const consumed = dispatchPointer(
                event,
                (info) => managerRef.current?.pointerDown(info) ?? false,
              );
              if (consumed) event.stopPropagation();
            }}
            onPointerMoveCapture={(event) =>
              dispatchPointer(event, (info) => managerRef.current?.pointerMove(info))
            }
            onPointerUpCapture={(event) =>
              dispatchPointer(event, (info) => managerRef.current?.pointerUp(info))
            }
          />
          <div className="animation-layer">{renderAnimationButtons()}</div>
        </div>
        <Inspector
          document={document}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRename={handleRename}
          onSetHidden={handleSetHidden}
          onUpdateStyle={handleUpdateStyle}
          onSetVariableValue={handleSetVariableValue}
          onSetVariableRange={handleSetVariableRange}
          onSetExpression={handleSetExpression}
          onMovePoint={handleMovePoint}
          onSetValueLock={handleSetValueLock}
          onSetPointLocked={handleSetPointLocked}
          onSetTraced={handleSetTraced}
          onUpdatePointDisplay={handleUpdatePointDisplay}
          onUpdateAnimation={handleUpdateAnimation}
          onPlayAnimation={playAnimation}
          onUpdatePlot={handleUpdatePlot}
        />
      </div>
      <div className="status-bar">{status || " "}</div>
      {isDebugEnabled() && <DebugPanel />}
      {mathDialog && (
        <MathDialog
          kind={mathDialog.kind}
          scope={variableScope(document)}
          validateExpression={validateCalculation}
          onConfirm={confirmMathDialog}
          onCancel={() => setMathDialog(null)}
        />
      )}
    </div>
  );
}
