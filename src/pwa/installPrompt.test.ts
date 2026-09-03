// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { detectIos, dismissInstallHint, isInstallHintDismissed } from "./installPrompt";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

describe("detectIos", () => {
  it("detects iPhone and iPod user agents", () => {
    expect(detectIos(IPHONE_UA, "iPhone", 5)).toBe(true);
  });

  it("detects iPadOS reporting as MacIntel with touch", () => {
    expect(detectIos(MAC_UA, "MacIntel", 5)).toBe(true);
  });

  it("does not flag Android or real Macs", () => {
    expect(detectIos(ANDROID_UA, "Linux armv8l", 5)).toBe(false);
    expect(detectIos(MAC_UA, "MacIntel", 0)).toBe(false);
  });
});

describe("install hint dismissal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is not dismissed by default", () => {
    expect(isInstallHintDismissed()).toBe(false);
  });

  it("persists dismissal", () => {
    dismissInstallHint();
    expect(isInstallHintDismissed()).toBe(true);
  });
});
