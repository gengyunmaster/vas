import { describe, expect, it } from "vitest";
import { AUDIO_BADGE_HEIGHT, AUDIO_BADGE_WIDTH, createAudioItem } from "./audioItem";
import { badgePalette, badgeToSvgElements } from "./mediaBadge";
import { PLACEMENT_MARGIN } from "./page";

describe("badgePalette", () => {
  it("uses a dark-on-light palette on light paper", () => {
    const palette = badgePalette("#ffffff");
    expect(palette.icon).toBe("#1a1a1a");
    expect(palette.onIcon).toBe("#ffffff");
  });

  it("uses a light-on-dark palette on dark paper", () => {
    const palette = badgePalette("#26262a");
    expect(palette.icon).toBe("#f5f5f5");
    expect(palette.onIcon).toBe("#26262a");
  });
});

describe("badgeToSvgElements", () => {
  const item = { id: "a1", audioId: "m1", x: 40, y: 40, width: 240, height: 44 };

  it("emits a pill, a play circle with triangle, and a progress track", () => {
    const elements = badgeToSvgElements(item, "#ffffff");
    expect(elements).toHaveLength(5);
    const joined = elements.join("\n");
    expect(joined).toContain('<rect x="40" y="40" width="240" height="44" rx="22"');
    expect(joined).toContain("<circle");
    expect(joined).toContain("<polygon");
    expect(joined).toContain("<line");
    expect(joined).toContain(badgePalette("#ffffff").icon);
  });

  it("adapts the palette to the paper color", () => {
    const light = badgeToSvgElements(item, "#ffffff").join("\n");
    const dark = badgeToSvgElements(item, "#26262a").join("\n");
    expect(light).not.toBe(dark);
    expect(dark).toContain(badgePalette("#26262a").background);
  });
});

describe("createAudioItem", () => {
  it("places the default-size badge at the top-left placement margin", () => {
    const item = createAudioItem("m1", 794);
    expect(item.audioId).toBe("m1");
    expect(item.x).toBe(PLACEMENT_MARGIN);
    expect(item.y).toBe(PLACEMENT_MARGIN);
    expect(item.width).toBe(AUDIO_BADGE_WIDTH);
    expect(item.height).toBe(AUDIO_BADGE_HEIGHT);
  });

  it("shrinks proportionally on narrow pages", () => {
    const item = createAudioItem("m1", 300);
    expect(item.width).toBe(300 - PLACEMENT_MARGIN * 2);
    expect(item.height).toBeCloseTo(((300 - PLACEMENT_MARGIN * 2) / AUDIO_BADGE_WIDTH) * 44);
  });

  it("keeps a usable minimum width on tiny pages", () => {
    const item = createAudioItem("m1", 200);
    expect(item.width).toBe(120);
  });
});
