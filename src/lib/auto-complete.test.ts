import { describe, it, expect } from "vitest";

// Extract the consecutive-strong check as a pure function for testing
function hasConsecutiveStrong(
  answers: Array<{ metadata: Record<string, unknown> | null }>,
  threshold = 3,
): boolean {
  if (answers.length < threshold) return false;
  const lastN = answers.slice(-threshold);
  return lastN.every((a) => a.metadata?.quality === "strong");
}

describe("hasConsecutiveStrong", () => {
  it("returns true for 3 consecutive strong", () => {
    const answers = [
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
    ];
    expect(hasConsecutiveStrong(answers)).toBe(true);
  });

  it("returns false for 2 strong + 1 weak", () => {
    const answers = [
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
      { metadata: { quality: "weak" } },
    ];
    expect(hasConsecutiveStrong(answers)).toBe(false);
  });

  it("returns false for less than 3 answers", () => {
    const answers = [
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
    ];
    expect(hasConsecutiveStrong(answers)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasConsecutiveStrong([])).toBe(false);
  });

  it("ignores answers beyond the threshold", () => {
    const answers = [
      { metadata: { quality: "weak" } },
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
      { metadata: { quality: "strong" } },
    ];
    // Last 3 are strong, even though first was weak
    expect(hasConsecutiveStrong(answers)).toBe(true);
  });

  it("returns false when metadata is missing", () => {
    const answers = [
      { metadata: { quality: "strong" } },
      { metadata: null },
      { metadata: { quality: "strong" } },
    ];
    expect(hasConsecutiveStrong(answers)).toBe(false);
  });
});
