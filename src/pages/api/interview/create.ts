import type { APIRoute } from "astro";
import { captureEvent, flush } from "@/lib/posthog";
import { createClient } from "@/lib/supabase";
import { checkInterviewLimit, incrementInterviewCounter } from "@/lib/tiers";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/new-session?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const mode = (form.get("mode") as string) || "jd";
  const maxRounds = parseInt(form.get("maxRounds") as string) || 5;
  let roleLevel: string | undefined;
  let domain: string | undefined;

  // Check interview limit
  const { allowed, message } = await checkInterviewLimit(supabase, user.id);
  if (!allowed) {
    return context.redirect(`/new-session?error=${message}`);
  }

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, status: "created" })
    .select("id")
    .single();

  if (sessionErr || !session) return context.redirect("/new-session?error=session_failed");

  await incrementInterviewCounter(supabase, user.id);

  // Create default challenge for this session
  const { data: challenge } = await supabase
    .from("challenges")
    .insert({
      session_id: session.id,
      status: "active",
      max_rounds: maxRounds,
    })
    .select("id")
    .single();

  const challengeId = challenge?.id;

  if (mode === "tech-stack") {
    const technologies = (form.get("technologies") as string)?.trim();
    const roleInput = (form.get("role") as string)?.trim();
    const domainInput = (form.get("domain") as string)?.trim();
    const tags = (form.get("tags") as string)?.trim() || "";

    if (!technologies || !roleInput) return context.redirect("/new-session?error=missing_tech_stack");

    roleLevel = roleInput;
    domain = domainInput || "General";

    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      challenge_id: challengeId,
      content: JSON.stringify({
        mode: "tech-stack",
        technologies,
        role_level: roleInput,
        domain: domain,
        tags,
      }),
      status: "committed",
    });
  } else {
    const jd = (form.get("jd") as string | null)?.trim();
    if (!jd || jd.length < 50) return context.redirect("/new-session?error=jd_too_short");

    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      challenge_id: challengeId,
      content: JSON.stringify({ raw_jd: jd, status: "pending", mode: "jd" }),
      status: "committed",
    });
  }

  // Fire once the session is fully created (JD-mode role/domain are only known
  // after AI extraction in generate.ts, so they are omitted here for `jd`).
  const sessionProperties: Record<string, string | number | boolean> = { mode, max_rounds: maxRounds };
  if (mode === "tech-stack" && roleLevel && domain) {
    sessionProperties.role_level = roleLevel;
    sessionProperties.domain = domain;
  }
  captureEvent({ distinctId: user.id, event: "session_created", properties: sessionProperties });
  await flush();

  return context.redirect(`/interview/${session.id}`);
};
