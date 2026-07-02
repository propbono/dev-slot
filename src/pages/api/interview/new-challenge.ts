type SystemContent = {
  mode?: string;
  raw_jd?: string;
  technologies?: string;
  role_level?: string;
  domain?: string;
  tech_stack?: string[];
  tags?: string;
  status?: string;
};

import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateChallenge, type JDConstraints } from "@/lib/ai";
import { checkChallengeLimit } from "@/lib/tiers";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/new-session?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const sessionId = (form.get("sessionId") as string | null)?.trim();
  if (!sessionId) return context.redirect("/new-session?error=missing_session");

  // Verify session ownership
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return context.redirect("/new-session?error=session_not_found");

  // Check challenge limit
  const { allowed, message } = await checkChallengeLimit(supabase, user.id, sessionId);
  if (!allowed) {
    return context.redirect(`/interview/${sessionId}?error=${message}`);
  }

  // Get stack data from system message
  const { data: sysMsgs } = await supabase
    .from("session_messages")
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "system")
    .eq("status", "committed")
    .limit(1);

  if (!sysMsgs || sysMsgs.length === 0) return context.redirect(`/interview/${sessionId}?error=no_stack`);

  let constraints: JDConstraints;
  let jd: string;
  const content = JSON.parse(sysMsgs[0].content) as SystemContent;

  if (content.mode === "tech-stack") {
    constraints = {
      tech_stack: (content.technologies ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean),
      role_level: content.role_level ?? "Senior",
      domain: content.domain ?? "General",
    };
    jd = `Targeting a ${constraints.role_level} role in ${constraints.domain} with experience in ${constraints.tech_stack.join(", ")}.`;
  } else {
    constraints = {
      tech_stack: (content.tech_stack as string[]) || [],
      role_level: content.role_level ?? "Senior",
      domain: content.domain ?? "General",
    };
    jd = content.raw_jd ?? "";
  }

  // Get previous challenge topics to avoid repetition
  const { data: prevChallenges } = await supabase
    .from("session_messages")
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "interviewer")
    .eq("status", "committed")
    .order("created_at");

  const previousTopics = (prevChallenges ?? []).map((m) => m.content.substring(0, 100));

  try {
    const challenge = await generateChallenge(jd, constraints, previousTopics);

    // Get previous challenge max_rounds to inherit
    const { data: prevChallenge } = await supabase
      .from("challenges")
      .select("max_rounds")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Create new challenge row
    const { data: newChallenge } = await supabase
      .from("challenges")
      .insert({
        session_id: sessionId,
        status: "active",
        max_rounds: (prevChallenge?.max_rounds as number) ?? 5,
      })
      .select("id")
      .single();

    // Insert new challenge message
    await supabase.from("session_messages").insert({
      session_id: sessionId,
      role: "interviewer",
      content: challenge,
      status: "committed",
      challenge_id: newChallenge?.id,
    });

    return context.redirect(`/interview/${sessionId}`);
  } catch {
    return context.redirect(`/interview/${sessionId}?error=challenge_failed`);
  }
};
