import type { QpdfInstance } from "@neslinesli93/qpdf-wasm";

export type QpdfFS = QpdfInstance["FS"] & {
  writeFile: (path: string, data: Uint8Array) => void;
  unlink: (path: string) => void;
};

const INPUT_PATH = "/input.pdf";
const OUTPUT_PATH = "/output.pdf";
const QPDF_OK = 0;
const QPDF_WARNINGS = 3;

let qpdfPromise: Promise<QpdfInstance> | null = null;

function loadQpdf(): Promise<QpdfInstance> {
  qpdfPromise ??= (async () => {
    const [qpdf, wasm] = await Promise.all([
      import("@neslinesli93/qpdf-wasm"),
      import("@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url"),
    ]);
    return qpdf.default({ locateFile: () => wasm.default });
  })();
  qpdfPromise.catch(() => {
    qpdfPromise = null;
  });
  return qpdfPromise;
}

export function decryptPdfWith(
  qpdf: QpdfInstance,
  bytes: Uint8Array,
  password?: string,
): Uint8Array {
  const fs = qpdf.FS as QpdfFS;
  for (const path of [INPUT_PATH, OUTPUT_PATH]) {
    try {
      fs.unlink(path);
    } catch {
      // stale files from a previous run may not exist
    }
  }
  fs.writeFile(INPUT_PATH, bytes);
  // Without --deterministic-id, qpdf generates a time-based trailer ID for
  // inputs lacking one, breaking the content-addressed docId on re-inserts.
  const args = ["--decrypt", "--deterministic-id"];
  if (password) args.push(`--password=${password}`);
  args.push(INPUT_PATH, OUTPUT_PATH);
  let code: number;
  try {
    code = qpdf.callMain(args);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === undefined) throw error;
    code = status;
  }
  if (code !== QPDF_OK && code !== QPDF_WARNINGS) {
    throw new Error(`qpdf failed to decrypt the PDF (exit code ${code})`);
  }
  const output = fs.readFile(OUTPUT_PATH);
  fs.unlink(INPUT_PATH);
  fs.unlink(OUTPUT_PATH);
  return output;
}

export async function decryptPdf(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  return decryptPdfWith(await loadQpdf(), bytes, password);
}
