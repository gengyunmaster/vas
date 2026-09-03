export function outlineToSvgPath(outline: number[][], scale = 1): string {
  const segments = outline.map(([x, y], index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${(x * scale).toFixed(2)} ${(y * scale).toFixed(2)}`;
  });
  return `${segments.join(" ")} Z`;
}

export function pointsToSvgPath(points: readonly { x: number; y: number }[], scale = 1): string {
  return points
    .map(
      (p, index) =>
        `${index === 0 ? "M" : "L"}${(p.x * scale).toFixed(2)} ${(p.y * scale).toFixed(2)}`,
    )
    .join(" ");
}
