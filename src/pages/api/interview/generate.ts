import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { extractConstraints, generateChallenge } from "@/lib/ai";

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ ready: false, error: "not_configured" });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ ready: false, error: "unauthorized" }, { status: 401 });

  const sessionId = context.url.searchParams.get("sessionId");
  if (!sessionId) return Response.json({ ready: false, error: "missing_session" }, { status: 400 });

  // Verify session ownership
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (sessionErr || !session)
    return Response.json({ ready: false, error: "session_not_found" }, { status: 404 });

  // Check if generation already completed
  const { data: existing } = await supabase
    .from("session_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "interviewer")
    .eq("status", "committed")
    .limit(1);

  if (existing && existing.length > 0) {
    return Response.json({ ready: true });
  }

  // Read JD from system message
  const { data: systemMsgs } = await supabase
    .from("session_messages")
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "system")
    .eq("status", "committed")
    .order("created_at")
    .limit(1);

  if (!systemMsgs || systemMsgs.length === 0)
    return Response.json({ ready: false, error: "no_jd_found" });

  let jd: string;
  try {
    const parsed = JSON.parse(systemMsgs[0].content);
    jd = parsed.raw_jd;
    if (!jd) throw new Error("Missing raw_jd");
  } catch {
    return Response.json({ ready: false, error: "invalid_jd" });
  }

  try {
    // Step 1: Extract constraints
    const constraints = await extractConstraints(jd);

    // Update system message with extracted constraints
    await supabase
      .from("session_messages")
      .update({
        content: JSON.stringify({
          raw_jd: jd,
          tech_stack: constraints.tech_stack,
          role_level: constraints.role_level,
          domain: constraints.domain,
          status: "extracted",
        }),
      })
      .eq("session_id", sessionId)
      .eq("role", "system")
      .eq("status", "committed");

    // Step 2: Generate challenge
    const challenge = await generateChallenge(jd, constraints);
    await supabase.from("session_messages").insert({
      session_id: sessionId,
      role: "interviewer",
      content: challenge,
      status: "committed",
    });

    // Mark session active
    await supabase
      .from("sessions")
      .update({ status: "active" })
      .eq("id", sessionId);

    return Response.json({ ready: true });
  } catch {
    return Response.json({ ready: false, error: "generation_failed" });
  }
};
