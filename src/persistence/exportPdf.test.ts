import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { pdfOrientation } from "./exportPdf";

describe("pdfOrientation", () => {
  it("keeps a wide selection landscape so jsPDF does not swap the format", () => {
    expect(pdfOrientation(400, 100)).toBe("landscape");
    const doc = new jsPDF({
      unit: "pt",
      format: [400, 100],
      orientation: pdfOrientation(400, 100),
    });
    expect(doc.internal.pageSize.getWidth()).toBe(400);
    expect(doc.internal.pageSize.getHeight()).toBe(100);
  });

  it("keeps a tall selection portrait", () => {
    expect(pdfOrientation(100, 400)).toBe("portrait");
    const doc = new jsPDF({
      unit: "pt",
      format: [100, 400],
      orientation: pdfOrientation(100, 400),
    });
    expect(doc.internal.pageSize.getWidth()).toBe(100);
    expect(doc.internal.pageSize.getHeight()).toBe(400);
  });
});
