import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { evaluateAnswer, generateSummary, type JDConstraints } from "@/lib/ai";
import { checkTurnLimit } from "@/lib/tiers";
import { guardAiCall } from "@/lib/ai-guard";

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

  if (!sessionId || !answer) return context.redirect(`/interview/${sessionId}?error=missing_fields`);

  // Verify session ownership
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionErr || !session) return context.redirect("/new-session?error=session_not_found");

  // Get active challenge
  const { data: challenge } = await supabase
    .from("challenges")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "active")
    .single();

  if (!challenge) return context.redirect("/new-session?error=no_active_challenge");

  // Check turn limit
  const { allowed: turnAllowed, message: turnMsg } = await checkTurnLimit(supabase, user.id, challenge.id);
  if (!turnAllowed) {
    return context.redirect(`/interview/${sessionId}?error=${turnMsg}`);
  }

  // Idempotency guard: if this exact answer is already the latest committed
  // user message (i.e. a concurrent submit or a just-failed evaluation),
  // don't evaluate it twice.
  const { data: latestMsgs } = await supabase
    .from("session_messages")
    .select("id, role, content")
    .eq("challenge_id", challenge.id)
    .eq("status", "committed")
    .order("created_at", { ascending: false })
    .limit(1);

  const latestMsg = latestMsgs?.[0];
  if (latestMsg?.role === "user" && latestMsg.content === answer) {
    return context.redirect(`/interview/${sessionId}`);
  }

  // Flip draft to committed (or insert if no draft exists)
  const { data: draft } = await supabase
    .from("session_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .eq("status", "draft")
    .single();

  let answerRowId: string | undefined = draft?.id;
  if (answerRowId) {
    await supabase
      .from("session_messages")
      .update({ content: answer, status: "committed", metadata: {} })
      .eq("id", answerRowId);
  } else {
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
    answerRowId = inserted?.id;
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

  const revertAnswerToDraft = async () => {
    if (answerRowId) {
      await supabase.from("session_messages").update({ status: "draft", metadata: {} }).eq("id", answerRowId);
    }
  };

  // Retry loop for evaluation. Each attempt is an AI call and is guarded.
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const evalGuard = await guardAiCall(supabase, {
      userId: user.id,
      ip: context.clientAddress,
      operation: "evaluate",
    });
    if (!evalGuard.allowed) {
      await revertAnswerToDraft();
      return context.redirect(`/interview/${sessionId}?error=${evalGuard.reason}`);
    }

    try {
      const result = await evaluateAnswer(constraints, challengeMsg.content, answerMsg.content);

      // Update answer message with evaluation metadata
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

      // Check for auto-complete: 3 consecutive strong OR max rounds reached
      let shouldComplete = false;

      // Strong path: 3 consecutive strong answers
      if (result.quality === "strong") {
        const { data: lastThree } = await supabase
          .from("session_messages")
          .select("metadata")
          .eq("challenge_id", challenge.id)
          .eq("role", "user")
          .eq("status", "committed")
          .order("created_at", { ascending: false })
          .limit(3);

        const allStrong =
          lastThree?.length === 3 &&
          lastThree.every((a) => {
            const meta = a.metadata as Record<string, unknown> | null;
            return meta?.quality === "strong";
          });

        if (allStrong) shouldComplete = true;
      }

      // Max rounds path: check total answer count
      if (!shouldComplete) {
        const { data: fullChallenge } = await supabase
          .from("challenges")
          .select("max_rounds")
          .eq("id", challenge.id)
          .single();

        const maxRounds = fullChallenge?.max_rounds ?? 5;

        const { count: totalRounds } = await supabase
          .from("session_messages")
          .select("*", { count: "exact", head: true })
          .eq("challenge_id", challenge.id)
          .eq("role", "user")
          .eq("status", "committed");

        if (totalRounds && totalRounds >= maxRounds) {
          shouldComplete = true;
        }
      }

      if (shouldComplete) {
        // Build conversation text for summary
        const { data: allMsgs } = await supabase
          .from("session_messages")
          .select("role, content")
          .eq("challenge_id", challenge.id)
          .eq("status", "committed")
          .order("created_at");

        const conversation = (allMsgs ?? []).map((m) => `${m.role}: ${m.content}`).join("\n\n");

        const summaryGuard = await guardAiCall(supabase, {
          userId: user.id,
          ip: context.clientAddress,
          operation: "summary",
        });
        if (!summaryGuard.allowed) {
          // The evaluation itself succeeded; leave the challenge active and
          // surface the limit without losing the transcript.
          return context.redirect(`/interview/${sessionId}?error=${summaryGuard.reason}`);
        }

        const summary = await generateSummary(constraints, conversation);
        await supabase.from("challenges").update({ status: "completed", summary }).eq("id", challenge.id);
      }

      return context.redirect(`/interview/${sessionId}`);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — revert the answer so the user can retry.
  console.error("Evaluation failed after retries:", lastError);
  await revertAnswerToDraft();
  return context.redirect(`/interview/${sessionId}?error=evaluation_failed`);
};
