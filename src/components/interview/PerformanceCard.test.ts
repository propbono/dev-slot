import { describe, it, expect } from "vitest";

// Extract the data-selection logic from PerformanceCard
function getPerformanceData(
  messages: Array<{
    role: string;
    content: string;
    metadata?: Record<string, any>;
  }>,
) {
  const evaluated = messages
    .filter((m) => m.role === "user" && m.metadata?.quality)
    .reverse();
  if (evaluated.length === 0) return null;
  return evaluated[0].metadata;
}

describe("getPerformanceData", () => {
  it("returns latest evaluation metadata", () => {
    const messages = [
      { role: "system", content: "{}" },
      {
        role: "user",
        content: "First answer",
        metadata: { quality: "weak", confidence: 0.3, rationale: "needs work" },
      },
      {
        role: "user",
        content: "Second answer",
        metadata: { quality: "strong", confidence: 0.9, rationale: "great" },
      },
    ];

    const result = getPerformanceData(messages);
    expect(result).toEqual({
      quality: "strong",
      confidence: 0.9,
      rationale: "great",
    });
  });

  it("returns null when no evaluated messages", () => {
    const messages = [
      { role: "system", content: "{}" },
      { role: "user", content: "no metadata" },
    ];
    expect(getPerformanceData(messages)).toBeNull();
  });

  it("returns null for empty messages", () => {
    expect(getPerformanceData([])).toBeNull();
  });

  it("ignores user messages without quality metadata", () => {
    const messages = [
      { role: "user", content: "no quality", metadata: { other: true } },
      {
        role: "user",
        content: "has quality",
        metadata: { quality: "weak", confidence: 0.5, rationale: "ok" },
      },
    ];
    const result = getPerformanceData(messages);
    expect(result?.quality).toBe("weak");
  });
});
