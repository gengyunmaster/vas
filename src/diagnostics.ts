import { version } from "../package.json";

export interface DiagnosticsContext {
  userAgent: string;
  url: string;
  time: string;
}

export function describeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  return { name: "Error", message: String(error), stack: "" };
}

export function buildDiagnostics(
  error: unknown,
  context: DiagnosticsContext,
  componentStack?: string | null,
): string {
  const { name, message, stack } = describeError(error);
  const lines = [
    `vas ${version}`,
    `Time: ${context.time}`,
    `URL: ${context.url}`,
    `User-Agent: ${context.userAgent}`,
    "",
    `${name}: ${message}`,
  ];
  if (stack) lines.push(stack);
  if (componentStack) lines.push("", "Component stack:", componentStack.trim());
  return lines.join("\n");
}

export function currentDiagnosticsContext(): DiagnosticsContext {
  return {
    userAgent: navigator.userAgent,
    url: window.location.href,
    time: new Date().toISOString(),
  };
}
