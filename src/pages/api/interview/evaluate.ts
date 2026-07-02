import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { evaluateAnswer, generateSummary, type JDConstraints } from "@/lib/ai";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/new-session?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const sessionId = (form.get("sessionId") as string)?.trim();
  const answer = (form.get("answer") as string)?.trim();

  if (!sessionId || !answer)
    return context.redirect(`/interview/${sessionId}?error=missing_fields`);

  // Verify session ownership
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionErr || !session)
    return context.redirect("/new-session?error=session_not_found");

  // Get active challenge
  const { data: challenge } = await supabase
    .from("challenges")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .single();

  if (!challenge)
    return context.redirect("/new-session?error=no_active_challenge");

  // Flip draft to committed (or insert if no draft exists)
  const { data: draft } = await supabase
    .from("session_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .eq("status", "draft")
    .single();

  const answerId = draft?.id;
  if (answerId) {
    await supabase
      .from("session_messages")
      .update({ content: answer, status: "committed", metadata: {} })
      .eq("id", answerId);
  } else {
    // No draft existed — insert committed directly
    const { data: inserted } = await supabase
      .from("session_messages")
      .insert({
        session_id: sessionId,
        role: "user",
        content: answer,
        challenge_id: challenge.id,
        status: "committed",
      })
      .select("id")
      .single();
    // Assign for metadata update below
  }

  // Fetch context for evaluation
  const { data: messages } = await supabase
    .from("session_messages")
    .select("id, role, content")
    .eq("session_id", sessionId)
    .eq("status", "committed")
    .order("created_at");

  const systemMsg = messages?.find((m) => m.role === "system");
  const challengeMsg = messages?.find((m) => m.role === "interviewer");
  const answerMsg = messages?.findLast((m) => m.role === "user");

  if (!systemMsg || !challengeMsg || !answerMsg) {
    return context.redirect(`/interview/${sessionId}?error=missing_context`);
  }

  let constraints: JDConstraints;
  try {
    constraints = JSON.parse(systemMsg.content);
  } catch {
    return context.redirect(`/interview/${sessionId}?error=invalid_context`);
  }

  // Retry loop for evaluation
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await evaluateAnswer(
        constraints,
        challengeMsg.content,
        answerMsg.content,
      );

      // Update answer message with evaluation metadata
      const answerRowId = answerMsg.id || answerId;
      if (answerRowId) {
        await supabase
          .from("session_messages")
          .update({
            metadata: {
              quality: result.quality,
              confidence: result.confidence,
              rationale: result.rationale,
            },
          })
          .eq("id", answerRowId);
      }

      // Insert follow-up as interviewer message
      await supabase.from("session_messages").insert({
        session_id: sessionId,
        role: "interviewer",
        content: result.followUp,
        status: "committed",
        challenge_id: challenge.id,
      });

      // Check for auto-complete: 3 consecutive strong answers
      if (result.quality === "strong") {
        const { data: recentAnswers } = await supabase
          .from("session_messages")
          .select("metadata")
          .eq("challenge_id", challenge.id)
          .eq("role", "user")
          .eq("status", "committed")
          .order("created_at", { ascending: false })
          .limit(3);

        const allStrong =
          recentAnswers &&
          recentAnswers.length === 3 &&
          recentAnswers.every(
            (a) => a.metadata?.quality === "strong",
          );

        if (allStrong) {
          // Build conversation text for summary
          const { data: allMsgs } = await supabase
            .from("session_messages")
            .select("role, content")
            .eq("challenge_id", challenge.id)
            .eq("status", "committed")
            .order("created_at");

          const conversation = (allMsgs ?? [])
            .map((m) => `${m.role}: ${m.content}`)
            .join("\n\n");

          const summary = await generateSummary(constraints, conversation);
          await supabase
            .from("challenges")
            .update({ status: "completed", summary })
            .eq("id", challenge.id);
        }
      }

      return context.redirect(`/interview/${sessionId}`);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted
  console.error("Evaluation failed after retries:", lastError);
  return context.redirect("/new-session?error=evaluation_failed");
};
