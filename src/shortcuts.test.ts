import { describe, expect, it } from "vitest";
import { COMBOS, matchCombo, type ShortcutCombo } from "./shortcuts";

function fakeEvent(
  key: string,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
  } as KeyboardEvent;
}

function matches(combo: ShortcutCombo, ...events: KeyboardEvent[]): boolean[] {
  return events.map((event) => matchCombo(event, combo));
}

describe("matchCombo", () => {
  it("matches modifier, shift and key independently", () => {
    const combo: ShortcutCombo = { key: "z", mod: true, shift: false };
    expect(matches(combo, fakeEvent("z", { ctrl: true }))[0]).toBe(true);
    expect(matches(combo, fakeEvent("z", { meta: true }))[0]).toBe(true);
    expect(matches(combo, fakeEvent("z"))[0]).toBe(false);
    expect(matches(combo, fakeEvent("z", { ctrl: true, shift: true }))[0]).toBe(false);
    expect(matches(combo, fakeEvent("x", { ctrl: true }))[0]).toBe(false);
  });

  it("treats an absent shift requirement as indifferent", () => {
    const combo: ShortcutCombo = { key: "c", mod: true };
    expect(matches(combo, fakeEvent("c", { ctrl: true }))[0]).toBe(true);
    expect(matches(combo, fakeEvent("c", { ctrl: true, shift: true }))[0]).toBe(true);
  });

  it("matches keys case-insensitively so shifted letters still count", () => {
    expect(matchCombo(fakeEvent("Z", { ctrl: true, shift: true }), COMBOS.redo[0])).toBe(true);
  });

  it("matches the question mark regardless of shift state", () => {
    expect(matchCombo(fakeEvent("?", { shift: true }), COMBOS.shortcuts)).toBe(true);
    expect(matchCombo(fakeEvent("?"), COMBOS.shortcuts)).toBe(true);
  });

  it("matches Delete with or without modifiers", () => {
    expect(matchCombo(fakeEvent("Delete"), COMBOS.deleteSelection)).toBe(true);
    expect(matchCombo(fakeEvent("Delete", { ctrl: true }), COMBOS.deleteSelection)).toBe(true);
  });
});
