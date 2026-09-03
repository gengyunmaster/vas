export const PRESSURE_CURVES = ["standard", "soft", "firm"] as const;
export type PressureCurve = (typeof PRESSURE_CURVES)[number];

export const PRESSURE_CURVE_LABELS: Record<PressureCurve, string> = {
  standard: "Standard",
  soft: "Soft",
  firm: "Firm",
};

// Gamma remap of stylus pressure: soft reaches full width with less force,
// firm demands a harder press. Applied at capture time; stored pressure is
// already curved, so exports need no knowledge of the setting.
export function applyPressureCurve(pressure: number, curve: PressureCurve): number {
  const p = Math.min(1, Math.max(0, pressure));
  if (curve === "soft") return p ** 0.65;
  if (curve === "firm") return p ** 1.5;
  return p;
}
