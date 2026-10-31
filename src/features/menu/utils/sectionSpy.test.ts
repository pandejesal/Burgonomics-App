import { describe, expect, it } from "vitest";
import { pickActiveSection, stickyScrollMargin } from "./sectionSpy";

const sections = [
  { id: "a", top: 96 },
  { id: "b", top: 700 },
  { id: "c", top: 1500 },
];

describe("pickActiveSection", () => {
  it("returns undefined with no sections", () => {
    expect(pickActiveSection([], 72)).toBeUndefined();
  });

  it("keeps the first heading active at scroll top (it has not reached the chrome line)", () => {
    expect(pickActiveSection(sections, 72)).toBe("a");
  });

  it("activates the last heading that has crossed the sticky chrome", () => {
    expect(
      pickActiveSection(
        [
          { id: "a", top: -400 },
          { id: "b", top: 70 },
          { id: "c", top: 300 },
        ],
        72,
      ),
    ).toBe("b");
  });

  it("stays on a tall section while the reader scrolls through it", () => {
    expect(
      pickActiveSection(
        [
          { id: "a", top: -2000 },
          { id: "b", top: 900 },
        ],
        72,
      ),
    ).toBe("a");
  });

  it("keeps the previous section until the next heading really reaches the line", () => {
    // 80 is 8px below the chrome line: not active yet (tolerance 1px).
    expect(
      pickActiveSection(
        [
          { id: "a", top: -100 },
          { id: "b", top: 80 },
        ],
        72,
      ),
    ).toBe("a");
    expect(
      pickActiveSection(
        [
          { id: "a", top: -100 },
          { id: "b", top: 73 },
        ],
        72,
      ),
    ).toBe("b");
  });
});

describe("stickyScrollMargin", () => {
  it("adds a gap to the measured chrome bottom and never goes negative", () => {
    expect(stickyScrollMargin(128)).toBe(136);
    expect(stickyScrollMargin(-10)).toBe(8);
    expect(stickyScrollMargin(Number.NaN)).toBe(8);
  });
});
