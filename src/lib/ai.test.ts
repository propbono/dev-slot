import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: vi.fn(() => vi.fn()),
}));

vi.mock("astro:env/server", () => ({
  DEEPSEEK_API_KEY: "test-key",
}));

import { extractConstraints } from "./ai";

describe("extractConstraints", () => {
  it("parses valid JSON response", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"tech_stack":["React","AWS"],"role_level":"Staff","domain":"Fintech"}',
    } as any);

    const result = await extractConstraints("Fake JD");
    expect(result).toEqual({
      tech_stack: ["React", "AWS"],
      role_level: "Staff",
      domain: "Fintech",
    });
  });

  it("strips markdown fences", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '```json\n{"tech_stack":["Go"],"role_level":"Senior","domain":"SaaS"}\n```',
    } as any);

    const result = await extractConstraints("Fake JD");
    expect(result.tech_stack).toEqual(["Go"]);
  });

  it("throws ExtractionError on invalid JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: "not json at all",
    } as any);

    await expect(extractConstraints("Fake JD")).rejects.toThrow(
      "Failed to parse extraction JSON",
    );
  });
});
