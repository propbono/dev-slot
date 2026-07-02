import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase)
    return context.redirect("/new-session?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const mode = (form.get("mode") as string) || "jd";

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, status: "created" })
    .select("id")
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (sessionErr || !session)
    return context.redirect("/new-session?error=session_failed");

  // Create default challenge for this session
  const { data: challenge } = await supabase.from("challenges").insert({
    session_id: session.id,
    status: "active",
    max_rounds: parseInt(form.get("maxRounds") as string) || 5,
  }).select("id").single();

  const challengeId = challenge?.id;

  if (mode === "tech-stack") {
    const technologies = (form.get("technologies") as string)?.trim();
    const role = (form.get("role") as string)?.trim();
    const domain = (form.get("domain") as string)?.trim();
    const tags = (form.get("tags") as string)?.trim() || "";

    if (!technologies || !role)
      return context.redirect("/new-session?error=missing_tech_stack");

    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      challenge_id: challengeId,
      content: JSON.stringify({
        mode: "tech-stack",
        technologies,
        role_level: role,
        domain: domain || "General",
        tags,
      }),
      status: "committed",
    });
  } else {
    const jd = (form.get("jd") as string | null)?.trim();
    if (!jd || jd.length < 50)
      return context.redirect("/new-session?error=jd_too_short");

    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      challenge_id: challengeId,
      content: JSON.stringify({ raw_jd: jd, status: "pending", mode: "jd" }),
      status: "committed",
    });
  }

  return context.redirect(`/interview/${session.id}`);
};
