export function outlineToSvgPath(outline: number[][], scale = 1): string {
  const segments = outline.map(([x, y], index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${(x * scale).toFixed(2)} ${(y * scale).toFixed(2)}`;
  });
  return `${segments.join(" ")} Z`;
}
