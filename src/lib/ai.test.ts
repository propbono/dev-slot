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

import { extractConstraints, evaluateAnswer, generateChallenge, generateSummary } from "./ai";

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

    await expect(extractConstraints("Fake JD")).rejects.toThrow("Failed to parse extraction JSON");
  });
});

describe("evaluateAnswer", () => {
  const constraints = { tech_stack: ["React", "AWS"], role_level: "Staff", domain: "Fintech" };
  const challengeText = "Design a system...";

  it("parses strong evaluation JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"quality":"strong","confidence":0.85,"rationale":"Covers scaling well","followUp":"What about failure modes?"}',
    } as never);

    const result = await evaluateAnswer(constraints, challengeText, "My answer");
    expect(result.quality).toBe("strong");
    expect(result.confidence).toBe(0.85);
    expect(result.followUp).toContain("failure modes");
  });

  it("parses weak evaluation JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"quality":"weak","confidence":0.3,"rationale":"Missing tradeoffs","followUp":"How would you handle scale?"}',
    } as never);

    const result = await evaluateAnswer(constraints, challengeText, "Short answer");
    expect(result.quality).toBe("weak");
  });

  it("strips markdown fences from evaluation JSON", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '```json\n{"quality":"strong","confidence":0.9,"rationale":"Great","followUp":"Edge cases?"}\n```',
    } as never);

    const result = await evaluateAnswer(constraints, challengeText, "Answer");
    expect(result.quality).toBe("strong");
  });
});

describe("generateChallenge", () => {
  const constraints = { tech_stack: ["Go"], role_level: "Senior", domain: "SaaS" };

  it("returns challenge text", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: "Design a multi-tenant architecture for a SaaS platform.",
    } as never);

    const result = await generateChallenge("Fake JD", constraints);
    expect(result).toContain("multi-tenant");
  });

  it("includes previousTopics in prompt when provided", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: "Design a caching strategy.",
    } as never);

    await generateChallenge("Fake JD", constraints, ["scaling", "database"]);
    const promptArg = vi.mocked(generateText).mock.calls.at(-1)?.[0] as { prompt?: string };
    expect(promptArg?.prompt).toContain("Do NOT generate");
    expect(promptArg?.prompt).toContain("scaling");
  });
});

describe("generateSummary", () => {
  const constraints = { tech_stack: ["React"], role_level: "Staff", domain: "Fintech" };

  it("parses summary with strengths and improvement areas", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"quality":"strong","confidence":0.9,"rationale":"Excellent analysis","strengths":["Scaling","Tradeoffs"],"improvement_areas":["Edge cases"]}',
    } as never);

    const result = await generateSummary(constraints, "conversation text");
    expect(result.quality).toBe("strong");
    expect(result.strengths).toHaveLength(2);
    expect(result.improvement_areas).toHaveLength(1);
  });

  it("allows empty improvement_areas", async () => {
    const { generateText } = await import("ai");
    vi.mocked(generateText).mockResolvedValue({
      text: '{"quality":"strong","confidence":0.95,"rationale":"Perfect","strengths":["Everything"],"improvement_areas":[]}',
    } as never);

    const result = await generateSummary(constraints, "conv");
    expect(result.improvement_areas).toEqual([]);
  });
});
