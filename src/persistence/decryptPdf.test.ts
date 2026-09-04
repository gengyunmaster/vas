import createModule, { type QpdfInstance } from "@neslinesli93/qpdf-wasm";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptPdfWith, type QpdfFS } from "./decryptPdf";

const wasmPath = decodeURIComponent(
  new URL("../../node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm", import.meta.url).pathname,
);

const ENC_IN = "/enc-in.pdf";
const ENC_OUT = "/enc-out.pdf";

let qpdf: QpdfInstance;

beforeAll(async () => {
  qpdf = await createModule({ locateFile: () => wasmPath });
}, 20000);

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return doc.save();
}

function encryptPdf(bytes: Uint8Array, userPassword: string, ownerPassword: string): Uint8Array {
  const fs = qpdf.FS as QpdfFS;
  fs.writeFile(ENC_IN, bytes);
  qpdf.callMain(["--encrypt", userPassword, ownerPassword, "256", "--", ENC_IN, ENC_OUT]);
  const output = fs.readFile(ENC_OUT);
  fs.unlink(ENC_IN);
  fs.unlink(ENC_OUT);
  return output;
}

async function expectLoadable(bytes: Uint8Array): Promise<void> {
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
}

describe("decryptPdfWith", () => {
  it("decrypts a user-password-protected PDF", async () => {
    const encrypted = encryptPdf(await makePdf(), "userpw", "ownerpw");
    await expect(PDFDocument.load(encrypted)).rejects.toThrow();
    await expectLoadable(decryptPdfWith(qpdf, encrypted, "userpw"));
  });

  it("decrypts an owner-password-only PDF without a password", async () => {
    const encrypted = encryptPdf(await makePdf(), "", "ownerpw");
    await expectLoadable(decryptPdfWith(qpdf, encrypted));
  });

  it("passes through an unencrypted PDF", async () => {
    await expectLoadable(decryptPdfWith(qpdf, await makePdf()));
  });

  it("produces deterministic output for PDFs without a trailer ID", async () => {
    // pdf-lib writes no trailer ID, so qpdf generates one; a time-based ID
    // would give every insert of the same file a different content hash.
    const pdf = await makePdf();
    const first = decryptPdfWith(qpdf, pdf);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(decryptPdfWith(qpdf, pdf)).toEqual(first);
  });

  it("throws on a wrong password", async () => {
    const encrypted = encryptPdf(await makePdf(), "userpw", "ownerpw");
    expect(() => decryptPdfWith(qpdf, encrypted, "wrong")).toThrow();
  });
});
