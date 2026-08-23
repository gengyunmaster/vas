import { useEffect, useRef, useState } from "react";
import { ensureComputeEngine, isLatexValid, latexToExpression } from "../model";

export interface MathDialogValues {
  latex?: string;
  expression?: string;
  xLatex?: string;
  yLatex?: string;
  tMin?: number;
  tMax?: number;
  xMin?: number;
  xMax?: number;
}

interface MathDialogProps {
  kind: "function" | "parametric" | "calculation";
  scope: Record<string, number>;
  validateExpression?: (expression: string) => string | null;
  onConfirm: (values: MathDialogValues) => void;
  onCancel: () => void;
}

const TITLES: Record<MathDialogProps["kind"], string> = {
  function: "Plot f(x)",
  parametric: "Plot parametric curve",
  calculation: "Calculate",
};

export function MathDialog({
  kind,
  scope,
  validateExpression,
  onConfirm,
  onCancel,
}: MathDialogProps) {
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const mainFieldRef = useRef<HTMLElement | null>(null);
  const secondFieldRef = useRef<HTMLElement | null>(null);
  const tMinRef = useRef<HTMLInputElement | null>(null);
  const tMaxRef = useRef<HTMLInputElement | null>(null);
  const xMinRef = useRef<HTMLInputElement | null>(null);
  const xMaxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("mathlive"), import("mathlive/static.css"), ensureComputeEngine()])
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = () => {
    const read = (element: HTMLElement | null) =>
      (element as unknown as { value?: string } | null)?.value?.trim() ?? "";
    if (kind === "calculation") {
      const latex = read(mainFieldRef.current);
      if (!latex) return;
      const expression = latexToExpression(latex);
      if (!expression) {
        setError("Unsupported expression");
        return;
      }
      const problem = validateExpression?.(expression);
      if (problem) {
        setError(problem);
        return;
      }
      onConfirm({ expression });
      return;
    }
    if (kind === "function") {
      const latex = read(mainFieldRef.current);
      if (!latex) return;
      if (!isLatexValid(latex, scope)) {
        setError("Expression cannot be evaluated");
        return;
      }
      const xMinRaw = xMinRef.current?.value.trim() ?? "";
      const xMaxRaw = xMaxRef.current?.value.trim() ?? "";
      const xMin = xMinRaw === "" ? undefined : Number(xMinRaw);
      const xMax = xMaxRaw === "" ? undefined : Number(xMaxRaw);
      if (
        (xMinRaw !== "" && !Number.isFinite(xMin)) ||
        (xMaxRaw !== "" && !Number.isFinite(xMax))
      ) {
        setError("Invalid range bound");
        return;
      }
      if (xMin !== undefined && xMax !== undefined && xMin >= xMax) {
        setError("Invalid range: x min must be less than x max");
        return;
      }
      onConfirm({ latex, xMin, xMax });
      return;
    }
    const xLatex = read(mainFieldRef.current);
    const yLatex = read(secondFieldRef.current);
    const tMin = Number(tMinRef.current?.value ?? "0");
    const tMax = Number(tMaxRef.current?.value ?? "1");
    if (!xLatex || !yLatex) return;
    if (!isLatexValid(xLatex, scope) || !isLatexValid(yLatex, scope)) {
      setError("Expression cannot be evaluated");
      return;
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin >= tMax) {
      setError("Invalid range: t min must be less than t max");
      return;
    }
    onConfirm({ xLatex, yLatex, tMin, tMax });
  };

  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <div className="dialog">
        <div className="dialog-title">{TITLES[kind]}</div>
        {!ready && !loadFailed && <div className="dialog-loading">Loading math input…</div>}
        {loadFailed && (
          <div className="dialog-error">
            Could not load the math input component. Check your network connection and try again.
          </div>
        )}
        <div style={{ visibility: ready ? "visible" : "hidden" }}>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: math-field is a form-capable custom element */}
          <label className="dialog-field">
            <span>
              {kind === "function" ? "f(x) =" : kind === "parametric" ? "x(t) =" : "Expression"}
            </span>
            <math-field ref={mainFieldRef} />
          </label>
          {kind === "calculation" && (
            <div className="dialog-hint">Reference values as v_1, v_2, … or by name</div>
          )}
          {kind === "function" && (
            <label className="dialog-field">
              <span>x range</span>
              <input ref={xMinRef} type="text" placeholder="-∞" className="range-input" />
              <span>to</span>
              <input ref={xMaxRef} type="text" placeholder="+∞" className="range-input" />
            </label>
          )}
          {kind === "parametric" && (
            <>
              {/* biome-ignore lint/a11y/noLabelWithoutControl: math-field is a form-capable custom element */}
              <label className="dialog-field">
                <span>y(t) =</span>
                <math-field ref={secondFieldRef} />
              </label>
              <label className="dialog-field">
                <span>t range</span>
                <input ref={tMinRef} type="text" defaultValue="0" className="range-input" />
                <span>to</span>
                <input ref={tMaxRef} type="text" defaultValue="6.28" className="range-input" />
              </label>
            </>
          )}
        </div>
        {error && <div className="dialog-error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" className="plain-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="plain-button primary"
            onClick={confirm}
            disabled={!ready}
          >
            {kind === "calculation" ? "OK" : "Plot"}
          </button>
        </div>
      </div>
    </div>
  );
}
