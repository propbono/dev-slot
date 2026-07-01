import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText } from "ai";
import { DEEPSEEK_API_KEY } from "astro:env/server";

const deepseek = createDeepSeek({ apiKey: DEEPSEEK_API_KEY });

export type JDConstraints = {
  tech_stack: string[];
  role_level: string;
  domain: string;
}

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
  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
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
}

export async function generateChallenge(jdText: string, constraints: JDConstraints): Promise<string> {
  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
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
- Is answerable in 15-20 minutes

Return ONLY the challenge text.`,
  });
  return text;
}

export type EvaluationResult = {
  quality: "strong" | "weak";
  confidence: number;
  rationale: string;
  followUp: string;
}

export async function evaluateAnswer(
  constraints: JDConstraints,
  challenge: string,
  answer: string,
): Promise<EvaluationResult> {
  const { text } = await generateText({
    model: deepseek("deepseek-chat"),
    system:
      "You are an expert technical interviewer evaluating a system design answer. Return ONLY valid JSON, no other text.",
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
  return JSON.parse(cleaned) as EvaluationResult;
}
