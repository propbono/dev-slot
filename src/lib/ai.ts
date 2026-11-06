import * as Sentry from "@sentry/astro";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { DEEPSEEK_API_KEY, DEEPSEEK_MODEL } from "astro:env/server";

const deepseek = createDeepSeek({ apiKey: DEEPSEEK_API_KEY });

/**
 * DeepSeek V4 reasoning models (e.g. `deepseek-flash`) default to thinking ON,
 * which emits reasoning output around the actual answer. Disable thinking so
 * these prompts return clean JSON/text output.
 */
const JSON_OUTPUT_PROVIDER_OPTIONS = {
  deepseek: { thinking: { type: "disabled" } },
};

export type JDConstraints = {
  tech_stack: string[];
  role_level: string;
  domain: string;
};

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export async function extractConstraints(jdText: string): Promise<JDConstraints> {
  return Sentry.startSpan({ name: "ai.extractConstraints", op: "ai.run" }, async () => {
    const { text } = await generateText({
      model: deepseek(DEEPSEEK_MODEL),
      providerOptions: JSON_OUTPUT_PROVIDER_OPTIONS,
      system: "You extract structured information from job descriptions. Return ONLY valid JSON, no other text.",
      prompt: `Extract from the following job description:
1. Tech stack (technologies, frameworks, platforms)
2. Role level (Junior, Mid, Senior, Staff, Principal)
3. Domain (Fintech, Healthcare, E-commerce, SaaS, etc.)

Return JSON: {"tech_stack": [...], "role_level": "...", "domain": "..."}

Job description:
${jdText}`,
    });

    // Strip markdown fences and whitespace in case the LLM wraps the JSON
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      return JSON.parse(cleaned) as JDConstraints;
    } catch {
      throw new ExtractionError("Failed to parse extraction JSON", text);
    }
  });
}

export async function generateChallenge(
  jdText: string,
  constraints: JDConstraints,
  previousTopics?: string[],
): Promise<string> {
  return Sentry.startSpan({ name: "ai.generateChallenge", op: "ai.run" }, async () => {
    const avoidSection = previousTopics?.length
      ? `\n\nDo NOT generate a challenge about these topics (already covered):\n${previousTopics.map((t) => `- ${t}`).join("\n")}`
      : "";

    const { text } = await generateText({
      model: deepseek(DEEPSEEK_MODEL),
      providerOptions: JSON_OUTPUT_PROVIDER_OPTIONS,
      system:
        "You are an expert technical interviewer conducting system design interviews. Return ONLY the challenge text — no preamble, no labels.",
      prompt: `You are interviewing a ${constraints.role_level} engineer for a ${constraints.domain} role.
Tech stack: ${constraints.tech_stack.join(", ")}.

Original job description:
${jdText}

Generate a single, focused system design challenge that:
- Is open-ended (no single right answer)
- Requires architectural tradeoff reasoning
- Is specific to the role's domain and tech stack
- Is answerable in 15-20 minutes${avoidSection}

Return ONLY the challenge text.`,
    });
    return text;
  });
}

export type EvaluationResult = {
  quality: "strong" | "weak";
  confidence: number;
  rationale: string;
  followUp: string;
};

export async function evaluateAnswer(
  constraints: JDConstraints,
  challenge: string,
  answer: string,
): Promise<EvaluationResult> {
  return Sentry.startSpan({ name: "ai.evaluateAnswer", op: "ai.run" }, async () => {
    const { text } = await generateText({
      model: deepseek(DEEPSEEK_MODEL),
      providerOptions: JSON_OUTPUT_PROVIDER_OPTIONS,
      system:
        "You are an expert technical interviewer evaluating answers. Be direct and constructive — like a real interviewer giving feedback. Point out what the candidate missed or got right. Return ONLY valid JSON, no other text.",
      prompt: `You are evaluating a ${constraints.role_level} engineer for a ${constraints.domain} role.
Tech stack: ${constraints.tech_stack.join(", ")}.

Original challenge:
${challenge}

Candidate's answer:
${answer}

Evaluate the answer based on coverage of role-relevant constraints:
- Does the candidate address the domain's key concerns?
- Do they reason about tradeoffs?
- Do they demonstrate depth in the role's expected tech stack?

First, classify the quality as "strong" or "weak" with a confidence score (0-1).
Then generate ONE follow-up question:\n- If strong: escalate into an adversarial pressure-test (e.g., "What happens if a critical dependency fails?", "How would this handle 10x scale?")\n- If weak: de-escalate into a foundational diagnostic (e.g., "Let's start simpler — how would you model the core data?", "What's the main bottleneck in this design?")\n\nReturn JSON: {"quality": "strong"|"weak", "confidence": <0-1>, "rationale": "<one sentence>", "followUp": "<the follow-up question>"}`,
    });

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      return JSON.parse(cleaned) as EvaluationResult;
    } catch {
      throw new Error("Failed to parse evaluation JSON response");
    }
  });
}

export type ChallengeSummary = {
  quality: "strong" | "mixed";
  confidence: number;
  rationale: string;
  strengths: string[];
  improvement_areas: string[];
};

export async function generateSummary(constraints: JDConstraints, conversation: string): Promise<ChallengeSummary> {
  return Sentry.startSpan({ name: "ai.generateSummary", op: "ai.run" }, async () => {
    const { text } = await generateText({
      model: deepseek(DEEPSEEK_MODEL),
      providerOptions: JSON_OUTPUT_PROVIDER_OPTIONS,
      system:
        "You are evaluating a completed interview challenge. Provide an honest, constructive summary of the candidate's performance. Return ONLY valid JSON.",
      prompt: `You evaluated a ${constraints.role_level} engineer for a ${constraints.domain} role.\nTech stack: ${constraints.tech_stack.join(", ")}.\n\nFull conversation:\n${conversation}\n\nProvide a comprehensive summary:\n- Overall quality: "strong" (consistently high-quality answers) or "mixed" (some strong, some weak)\n- Confidence score (0-1)\n- One-sentence rationale\n- 2-4 specific strengths\n- 1-3 specific areas for improvement (if any, otherwise empty array)\n\nReturn JSON: {"quality": "strong"|"mixed", "confidence": <0-1>, "rationale": "...", "strengths": [...], "improvement_areas": [...]}`,
    });

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      return JSON.parse(cleaned) as ChallengeSummary;
    } catch {
      throw new Error("Failed to parse summary JSON response");
    }
  });
}
