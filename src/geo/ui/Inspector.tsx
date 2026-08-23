import { useRef, useState } from "react";
import type { GeoDocument, GeoObject, ObjectId, ObjectStyle } from "../model";
import { computeValue, formatValue, isLatexValid, listObjects, variableScope } from "../model";

interface PlotPatch {
  latex?: string;
  xLatex?: string;
  yLatex?: string;
  tMin?: number;
  tMax?: number;
  axis?: ObjectId | null;
  xMin?: number | null;
  xMax?: number | null;
}

interface InspectorProps {
  document: GeoDocument;
  selectedId: ObjectId | null;
  onSelect: (id: ObjectId | null) => void;
  onRename: (id: ObjectId, name: string) => void;
  onSetHidden: (id: ObjectId, hidden: boolean) => void;
  onUpdateStyle: (id: ObjectId, patch: ObjectStyle) => void;
  onSetVariableValue: (id: ObjectId, value: number) => void;
  onSetVariableRange: (id: ObjectId, min: number | null, max: number | null) => void;
  onSetExpression: (id: ObjectId, expression: string) => void;
  onMovePoint: (id: ObjectId, x: number, y: number) => void;
  onSetValueLock: (id: ObjectId, locked: number | null) => void;
  onSetPointLocked: (id: ObjectId, locked: boolean) => void;
  onSetTraced: (id: ObjectId, traced: boolean) => void;
  onUpdatePointDisplay: (
    id: ObjectId,
    patch: { showCoordinates?: boolean; coordinateAxes?: ObjectId | null | "auto" },
  ) => void;
  onUpdateAnimation: (
    id: ObjectId,
    patch: { duration?: number; mode?: "once" | "loop" | "pingpong" },
  ) => void;
  onPlayAnimation: (id: ObjectId) => void;
  onUpdatePlot: (id: ObjectId, patch: PlotPatch) => void;
}

const KIND_LABELS: Record<GeoObject["kind"], string> = {
  point: "Point",
  segment: "Segment",
  line: "Line",
  ray: "Ray",
  circle: "Circle",
  circumcircle: "Circle (3pt)",
  polygon: "Polygon",
  perpendicularLine: "Perpendicular",
  parallelLine: "Parallel",
  angleBisector: "Bisector",
  measurement: "Measurement",
  variable: "Variable",
  calculation: "Calculation",
  transform: "Transform",
  locus: "Locus",
  animation: "Animation",
  axisSystem: "Axes",
  numberAxis: "Number axis",
  functionPlot: "Function",
  parametricCurve: "Parametric",
  conic: "Conic",
  threePointParabola: "Parabola (3pt)",
  tangentLine: "Tangent",
  conicLine: "Conic line",
  iteration: "Iteration",
};

const STROKE_KINDS = new Set<GeoObject["kind"]>([
  "segment",
  "line",
  "ray",
  "circle",
  "circumcircle",
  "polygon",
  "perpendicularLine",
  "parallelLine",
  "angleBisector",
  "tangentLine",
  "conicLine",
  "transform",
  "locus",
  "conic",
  "threePointParabola",
  "functionPlot",
  "parametricCurve",
]);

const FILL_KINDS = new Set<GeoObject["kind"]>(["circle", "circumcircle", "polygon"]);

const DEFAULT_COLORS: Record<string, string> = {
  point: "#1f6feb",
  fixedPoint: "#6e7781",
  shape: "#24292f",
  fill: "#1f6feb",
};

const DASH_OPTIONS = [
  { value: 0, label: "Solid" },
  { value: 1, label: "Dotted" },
  { value: 2, label: "Dashed" },
  { value: 4, label: "Dense dash" },
];

const isFixedPoint = (object: GeoObject): boolean =>
  object.kind === "point" && (object.role === "midpoint" || object.role === "intersection");

const shortId = (id: ObjectId): string => id.slice(0, 6);

export function Inspector({
  document,
  selectedId,
  onSelect,
  onRename,
  onSetHidden,
  onUpdateStyle,
  onSetVariableValue,
  onSetVariableRange,
  onSetExpression,
  onMovePoint,
  onSetValueLock,
  onSetPointLocked,
  onSetTraced,
  onUpdatePointDisplay,
  onUpdateAnimation,
  onPlayAnimation,
  onUpdatePlot,
}: InspectorProps) {
  const selected = selectedId ? document.objects[selectedId] : undefined;
  return (
    <aside className="inspector">
      {selected ? (
        <ObjectEditor
          key={selected.id}
          object={selected}
          document={document}
          onRename={onRename}
          onSetHidden={onSetHidden}
          onUpdateStyle={onUpdateStyle}
          onSetVariableValue={onSetVariableValue}
          onSetVariableRange={onSetVariableRange}
          onSetExpression={onSetExpression}
          onMovePoint={onMovePoint}
          onSetValueLock={onSetValueLock}
          onSetPointLocked={onSetPointLocked}
          onSetTraced={onSetTraced}
          onUpdatePointDisplay={onUpdatePointDisplay}
          onUpdateAnimation={onUpdateAnimation}
          onPlayAnimation={onPlayAnimation}
          onUpdatePlot={onUpdatePlot}
          onClose={() => onSelect(null)}
        />
      ) : (
        <ObjectList document={document} onSelect={onSelect} onSetHidden={onSetHidden} />
      )}
    </aside>
  );
}

interface ObjectEditorProps {
  object: GeoObject;
  document: GeoDocument;
  onRename: (id: ObjectId, name: string) => void;
  onSetHidden: (id: ObjectId, hidden: boolean) => void;
  onUpdateStyle: (id: ObjectId, patch: ObjectStyle) => void;
  onSetVariableValue: (id: ObjectId, value: number) => void;
  onSetVariableRange: (id: ObjectId, min: number | null, max: number | null) => void;
  onSetExpression: (id: ObjectId, expression: string) => void;
  onMovePoint: (id: ObjectId, x: number, y: number) => void;
  onSetValueLock: (id: ObjectId, locked: number | null) => void;
  onSetPointLocked: (id: ObjectId, locked: boolean) => void;
  onSetTraced: (id: ObjectId, traced: boolean) => void;
  onUpdatePointDisplay: (
    id: ObjectId,
    patch: { showCoordinates?: boolean; coordinateAxes?: ObjectId | null | "auto" },
  ) => void;
  onUpdateAnimation: (
    id: ObjectId,
    patch: { duration?: number; mode?: "once" | "loop" | "pingpong" },
  ) => void;
  onPlayAnimation: (id: ObjectId) => void;
  onUpdatePlot: (id: ObjectId, patch: PlotPatch) => void;
  onClose: () => void;
}

function ObjectEditor({
  object,
  document,
  onRename,
  onSetHidden,
  onUpdateStyle,
  onSetVariableValue,
  onSetVariableRange,
  onSetExpression,
  onMovePoint,
  onSetValueLock,
  onSetPointLocked,
  onSetTraced,
  onUpdatePointDisplay,
  onUpdateAnimation,
  onPlayAnimation,
  onUpdatePlot,
  onClose,
}: ObjectEditorProps) {
  const style = object.style ?? {};
  const isPoint = object.kind === "point";
  const freeCoords: [number, number] | null =
    object.kind === "point" && object.role === "free" ? [object.x, object.y] : null;
  const freePointLocked =
    object.kind === "point" && object.role === "free" ? (object.locked ?? false) : null;
  const variableRange: [number | null, number | null] | null =
    object.kind === "variable" ? [object.min ?? null, object.max ?? null] : null;
  const hasStroke = STROKE_KINDS.has(object.kind);
  const hasFill = FILL_KINDS.has(object.kind);
  const isValueKind =
    object.kind === "measurement" || object.kind === "variable" || object.kind === "calculation";
  const strokeDefault = isPoint
    ? isFixedPoint(object)
      ? DEFAULT_COLORS.fixedPoint
      : DEFAULT_COLORS.point
    : DEFAULT_COLORS.shape;

  return (
    <div className="object-editor">
      <div className="editor-header">
        <span className="kind-badge">{KIND_LABELS[object.kind]}</span>
        <button type="button" className="plain-button" onClick={onClose}>
          Close
        </button>
      </div>
      <TextField
        key={`name-${object.name ?? ""}`}
        label="Name"
        initial={object.name ?? ""}
        placeholder="Unnamed"
        onCommit={(name) => onRename(object.id, name)}
      />
      <label className="field-row">
        <span>Hidden</span>
        <input
          type="checkbox"
          checked={object.hidden ?? false}
          onChange={(event) => onSetHidden(object.id, event.target.checked)}
        />
      </label>
      {(isPoint || hasStroke) && (
        <label className="field-row">
          <span>Traced</span>
          <input
            type="checkbox"
            checked={object.traced ?? false}
            onChange={(event) => onSetTraced(object.id, event.target.checked)}
          />
        </label>
      )}
      {isPoint && (
        <>
          <label className="field-row">
            <span>Coordinates</span>
            <input
              type="checkbox"
              checked={object.showCoordinates ?? false}
              onChange={(event) =>
                onUpdatePointDisplay(object.id, { showCoordinates: event.target.checked })
              }
            />
          </label>
          {(object.showCoordinates ?? false) && (
            <SelectField
              label="Coordinate system"
              value={object.coordinateAxes === undefined ? "auto" : (object.coordinateAxes ?? "")}
              options={[
                { value: "auto", label: "Auto" },
                { value: "", label: "Board coordinates" },
                ...listObjects(document, "axisSystem").map((axis, index) => ({
                  value: axis.id,
                  label: axis.name ?? `Axes ${index + 1}`,
                })),
              ]}
              onChange={(value) =>
                onUpdatePointDisplay(object.id, {
                  coordinateAxes: value === "auto" ? "auto" : value === "" ? null : value,
                })
              }
            />
          )}
        </>
      )}
      {freeCoords && (
        <>
          <label className="field-row">
            <span>Lock position</span>
            <input
              type="checkbox"
              checked={freePointLocked ?? false}
              onChange={(event) => onSetPointLocked(object.id, event.target.checked)}
            />
          </label>
          <TextField
            key={`x-${freeCoords[0]}`}
            label="X"
            initial={formatValue(freeCoords[0])}
            disabled={freePointLocked ?? false}
            onCommit={(raw) => {
              const x = Number(raw);
              if (Number.isFinite(x)) onMovePoint(object.id, x, freeCoords[1]);
            }}
          />
          <TextField
            key={`y-${freeCoords[1]}`}
            label="Y"
            initial={formatValue(freeCoords[1])}
            disabled={freePointLocked ?? false}
            onCommit={(raw) => {
              const y = Number(raw);
              if (Number.isFinite(y)) onMovePoint(object.id, freeCoords[0], y);
            }}
          />
        </>
      )}
      {object.kind === "variable" && (
        <>
          <TextField
            key={`value-${object.value}`}
            label="Value"
            initial={String(object.value)}
            onCommit={(raw) => {
              const value = Number(raw);
              if (Number.isFinite(value)) onSetVariableValue(object.id, value);
            }}
          />
          <TextField
            key={`min-${object.min}`}
            label="Slider min"
            initial={object.min === undefined ? "" : String(object.min)}
            placeholder="none"
            onCommit={(raw) => {
              const parsed = Number(raw);
              onSetVariableRange(
                object.id,
                raw.trim() === "" || !Number.isFinite(parsed) ? null : parsed,
                variableRange?.[1] ?? null,
              );
            }}
          />
          <TextField
            key={`max-${object.max}`}
            label="Slider max"
            initial={object.max === undefined ? "" : String(object.max)}
            placeholder="none"
            onCommit={(raw) => {
              const parsed = Number(raw);
              onSetVariableRange(
                object.id,
                variableRange?.[0] ?? null,
                raw.trim() === "" || !Number.isFinite(parsed) ? null : parsed,
              );
            }}
          />
        </>
      )}
      {object.kind === "calculation" && (
        <TextField
          key={`expression-${object.expression}`}
          label="Expression"
          initial={object.expression}
          onCommit={(expression) => onSetExpression(object.id, expression)}
        />
      )}
      {isValueKind && (
        <div className="field-row">
          <span>Current value</span>
          <span>{formatValue(computeValue(document, object.id))}</span>
        </div>
      )}
      {(object.kind === "measurement" || object.kind === "calculation") && (
        <>
          <label className="field-row">
            <span>Lock value</span>
            <input
              type="checkbox"
              checked={object.locked !== undefined}
              onChange={(event) => {
                if (event.target.checked) {
                  const value = computeValue(document, object.id);
                  if (value !== null) onSetValueLock(object.id, value);
                } else {
                  onSetValueLock(object.id, null);
                }
              }}
            />
          </label>
          {object.locked !== undefined && (
            <TextField
              key={`lock-${object.locked}`}
              label="Locked to"
              initial={formatValue(object.locked)}
              onCommit={(raw) => {
                const value = Number(raw);
                if (Number.isFinite(value)) onSetValueLock(object.id, value);
              }}
            />
          )}
        </>
      )}
      {object.kind === "animation" && (
        <>
          <div className="field-row">
            <span>Variant</span>
            <span>{object.variant}</span>
          </div>
          <TextField
            key={`duration-${object.duration ?? 3}`}
            label="Duration (s)"
            initial={String(object.duration ?? 3)}
            onCommit={(raw) => {
              const duration = Number(raw);
              if (Number.isFinite(duration) && duration > 0) {
                onUpdateAnimation(object.id, { duration });
              }
            }}
          />
          <SelectField
            label="Mode"
            value={object.mode ?? "pingpong"}
            options={[
              { value: "pingpong" as const, label: "Ping-pong" },
              { value: "loop" as const, label: "Loop" },
              { value: "once" as const, label: "Once" },
            ]}
            onChange={(mode) => onUpdateAnimation(object.id, { mode })}
          />
          <button type="button" className="plain-button" onClick={() => onPlayAnimation(object.id)}>
            Play / Stop
          </button>
        </>
      )}
      {object.kind === "functionPlot" && (
        <>
          <LatexField
            key={`latex-${object.latex}`}
            label="f(x) ="
            initial={object.latex}
            scope={variableScope(document)}
            onCommit={(latex) => onUpdatePlot(object.id, { latex })}
          />
          <TextField
            key={`xmin-${object.xMin}`}
            label="x min"
            initial={object.xMin === undefined ? "" : String(object.xMin)}
            placeholder="-∞"
            onCommit={(raw) => {
              const trimmed = raw.trim();
              if (trimmed === "") {
                onUpdatePlot(object.id, { xMin: null });
                return;
              }
              const xMin = Number(trimmed);
              if (Number.isFinite(xMin)) onUpdatePlot(object.id, { xMin });
            }}
          />
          <TextField
            key={`xmax-${object.xMax}`}
            label="x max"
            initial={object.xMax === undefined ? "" : String(object.xMax)}
            placeholder="+∞"
            onCommit={(raw) => {
              const trimmed = raw.trim();
              if (trimmed === "") {
                onUpdatePlot(object.id, { xMax: null });
                return;
              }
              const xMax = Number(trimmed);
              if (Number.isFinite(xMax)) onUpdatePlot(object.id, { xMax });
            }}
          />
        </>
      )}
      {object.kind === "parametricCurve" && (
        <>
          <LatexField
            key={`xlatex-${object.xLatex}`}
            label="x(t) ="
            initial={object.xLatex}
            scope={variableScope(document)}
            onCommit={(xLatex) => onUpdatePlot(object.id, { xLatex })}
          />
          <LatexField
            key={`ylatex-${object.yLatex}`}
            label="y(t) ="
            initial={object.yLatex}
            scope={variableScope(document)}
            onCommit={(yLatex) => onUpdatePlot(object.id, { yLatex })}
          />
          <TextField
            key={`tmin-${object.tMin}`}
            label="t min"
            initial={String(object.tMin)}
            onCommit={(raw) => {
              const tMin = Number(raw);
              if (Number.isFinite(tMin)) onUpdatePlot(object.id, { tMin });
            }}
          />
          <TextField
            key={`tmax-${object.tMax}`}
            label="t max"
            initial={String(object.tMax)}
            onCommit={(raw) => {
              const tMax = Number(raw);
              if (Number.isFinite(tMax)) onUpdatePlot(object.id, { tMax });
            }}
          />
        </>
      )}
      {(object.kind === "functionPlot" || object.kind === "parametricCurve") && (
        <SelectField
          label="Axes"
          value={object.axis ?? ""}
          options={[
            { value: "", label: "Board coordinates" },
            ...listObjects(document, "axisSystem").map((axis, index) => ({
              value: axis.id,
              label: axis.name ?? `Axes ${index + 1}`,
            })),
          ]}
          onChange={(axis) => onUpdatePlot(object.id, { axis: axis === "" ? null : axis })}
        />
      )}
      <ColorField
        key={`color-${style.strokeColor ?? strokeDefault}`}
        label="Color"
        initial={style.strokeColor ?? strokeDefault}
        onCommit={(strokeColor) => onUpdateStyle(object.id, { strokeColor })}
      />
      {isPoint && (
        <SelectField
          label="Point size"
          value={style.pointSize ?? 3}
          options={[1, 2, 3, 4, 5, 6].map((size) => ({ value: size, label: String(size) }))}
          onChange={(pointSize) => onUpdateStyle(object.id, { pointSize })}
        />
      )}
      {hasStroke && (
        <>
          <SelectField
            label="Line width"
            value={style.strokeWidth ?? 2}
            options={[1, 2, 3, 4, 5, 6].map((width) => ({ value: width, label: String(width) }))}
            onChange={(strokeWidth) => onUpdateStyle(object.id, { strokeWidth })}
          />
          <SelectField
            label="Line style"
            value={style.dash ?? 0}
            options={DASH_OPTIONS}
            onChange={(dash) => onUpdateStyle(object.id, { dash })}
          />
        </>
      )}
      {hasFill && (
        <>
          <ColorField
            key={`fill-${style.fillColor ?? DEFAULT_COLORS.fill}`}
            label="Fill color"
            initial={style.fillColor ?? DEFAULT_COLORS.fill}
            onCommit={(fillColor) => onUpdateStyle(object.id, { fillColor })}
          />
          <RangeField
            key={`opacity-${style.fillOpacity ?? (object.kind === "polygon" ? 0.12 : 0)}`}
            label="Fill opacity"
            initial={style.fillOpacity ?? (object.kind === "polygon" ? 0.12 : 0)}
            min={0}
            max={1}
            step={0.05}
            onCommit={(fillOpacity) => onUpdateStyle(object.id, { fillOpacity })}
          />
        </>
      )}
    </div>
  );
}

interface ObjectListProps {
  document: GeoDocument;
  onSelect: (id: ObjectId | null) => void;
  onSetHidden: (id: ObjectId, hidden: boolean) => void;
}

function ObjectList({ document, onSelect, onSetHidden }: ObjectListProps) {
  const objects = Object.values(document.objects);
  if (objects.length === 0) {
    return <div className="object-list empty">No objects yet</div>;
  }
  return (
    <div className="object-list">
      <div className="list-header">Objects ({objects.length})</div>
      {objects.map((object) => (
        <div key={object.id} className={`list-row${object.hidden ? " is-hidden" : ""}`}>
          <button type="button" className="list-select" onClick={() => onSelect(object.id)}>
            <span className="kind-badge">{KIND_LABELS[object.kind]}</span>
            <span className="row-name">{object.name || shortId(object.id)}</span>
          </button>
          <button
            type="button"
            className="plain-button"
            title={object.hidden ? "Show" : "Hide"}
            onClick={() => onSetHidden(object.id, !object.hidden)}
          >
            {object.hidden ? "Show" : "Hide"}
          </button>
        </div>
      ))}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  initial: string;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}

function LatexField({
  label,
  initial,
  scope,
  onCommit,
}: Omit<TextFieldProps, "placeholder"> & { scope: Record<string, number> }) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (!value.trim()) return;
    if (!isLatexValid(value, scope)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onCommit(value);
  };
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        style={invalid ? { borderColor: "#cf222e" } : undefined}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

function TextField({ label, initial, placeholder, disabled, onCommit }: TextFieldProps) {
  const [value, setValue] = useState(initial);
  const commit = () => {
    if (value !== initial) onCommit(value);
  };
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  initial: string;
  onCommit: (value: string) => void;
}

function ColorField({ label, initial, onCommit }: ColorFieldProps) {
  const [value, setValue] = useState(initial);
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value !== initial) onCommit(value);
        }}
      />
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  initial: number;
  min: number;
  max: number;
  step: number;
  onCommit: (value: number) => void;
}

function RangeField({ label, initial, min, max, step, onCommit }: RangeFieldProps) {
  const [value, setValue] = useState(initial);
  const committedRef = useRef(initial);
  const commit = () => {
    if (value === committedRef.current) return;
    committedRef.current = value;
    onCommit(value);
  };
  return (
    <label className="field-row">
      <span>{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => setValue(Number(event.target.value))}
        onMouseUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

interface SelectFieldProps<T extends string | number> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SelectFieldProps<T>) {
  return (
    <label className="field-row">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          const numeric = raw === "" ? NaN : Number(raw);
          onChange((Number.isNaN(numeric) ? raw : numeric) as T);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
