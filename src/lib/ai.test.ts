import { describe, it, expect, vi } from "vitest";

const { modelMock, generateTextMock } = vi.hoisted(() => ({
  modelMock: vi.fn(),
  generateTextMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
}));

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: vi.fn(() => modelMock),
}));

vi.mock("astro:env/server", () => ({
  DEEPSEEK_API_KEY: "test-key",
  DEEPSEEK_MODEL: "deepseek-flash",
}));

import { extractConstraints, evaluateAnswer, generateChallenge, generateSummary } from "./ai";

const mockText = (text: string) => generateTextMock.mockResolvedValue({ text });

const constraints = { tech_stack: ["React", "AWS"], role_level: "Staff", domain: "Fintech" };

describe("extractConstraints", () => {
  it("parses valid JSON response", async () => {
    mockText('{"tech_stack":["React","AWS"],"role_level":"Staff","domain":"Fintech"}');

    const result = await extractConstraints("Fake JD");
    expect(result).toEqual({
      tech_stack: ["React", "AWS"],
      role_level: "Staff",
      domain: "Fintech",
    });
  });

  it("strips markdown fences", async () => {
    mockText('```json\n{"tech_stack":["Go"],"role_level":"Senior","domain":"SaaS"}\n```');

    const result = await extractConstraints("Fake JD");
    expect(result.tech_stack).toEqual(["Go"]);
  });

  it("throws ExtractionError on invalid JSON", async () => {
    mockText("not json at all");

    await expect(extractConstraints("Fake JD")).rejects.toThrow("Failed to parse extraction JSON");
  });
});

describe("evaluateAnswer", () => {
  const challengeText = "Design a system...";

  it("parses strong evaluation JSON", async () => {
    mockText(
      '{"quality":"strong","confidence":0.85,"rationale":"Covers scaling well","followUp":"What about failure modes?"}',
    );

    const result = await evaluateAnswer(constraints, challengeText, "My answer");
    expect(result.quality).toBe("strong");
    expect(result.confidence).toBe(0.85);
    expect(result.followUp).toContain("failure modes");
  });

  it("parses weak evaluation JSON", async () => {
    mockText(
      '{"quality":"weak","confidence":0.3,"rationale":"Missing tradeoffs","followUp":"How would you handle scale?"}',
    );

    const result = await evaluateAnswer(constraints, challengeText, "Short answer");
    expect(result.quality).toBe("weak");
  });

  it("strips markdown fences from evaluation JSON", async () => {
    mockText('```json\n{"quality":"strong","confidence":0.9,"rationale":"Great","followUp":"Edge cases?"}\n```');

    const result = await evaluateAnswer(constraints, challengeText, "Answer");
    expect(result.quality).toBe("strong");
  });
});

describe("generateChallenge", () => {
  it("returns challenge text", async () => {
    mockText("Design a multi-tenant architecture for a SaaS platform.");

    const result = await generateChallenge("Fake JD", constraints);
    expect(result).toContain("multi-tenant");
  });

  it("includes previousTopics in prompt when provided", async () => {
    mockText("Design a caching strategy.");

    await generateChallenge("Fake JD", constraints, ["scaling", "database"]);
    const promptArg = generateTextMock.mock.calls.at(-1)?.[0] as { prompt?: string };
    expect(promptArg?.prompt).toContain("Do NOT generate");
    expect(promptArg?.prompt).toContain("scaling");
  });
});

describe("generateSummary", () => {
  it("parses summary with strengths and improvement areas", async () => {
    mockText(
      '{"quality":"strong","confidence":0.9,"rationale":"Excellent analysis","strengths":["Scaling","Tradeoffs"],"improvement_areas":["Edge cases"]}',
    );

    const result = await generateSummary(constraints, "conversation text");
    expect(result.quality).toBe("strong");
    expect(result.strengths).toHaveLength(2);
    expect(result.improvement_areas).toHaveLength(1);
  });

  it("allows empty improvement_areas", async () => {
    mockText(
      '{"quality":"strong","confidence":0.95,"rationale":"Perfect","strengths":["Everything"],"improvement_areas":[]}',
    );

    const result = await generateSummary(constraints, "conv");
    expect(result.improvement_areas).toEqual([]);
  });
});

describe("model configuration", () => {
  it("uses the configured DeepSeek model with thinking disabled", async () => {
    mockText("ok");

    await generateChallenge("Fake JD", constraints);

    expect(modelMock).toHaveBeenCalledWith("deepseek-flash");
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { deepseek: { thinking: { type: "disabled" } } },
      }),
    );
  });
});
