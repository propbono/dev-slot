import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { extractConstraints, generateChallenge } from "@/lib/ai";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/dashboard?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const jd = (form.get("jd") as string | null)?.trim();
  if (!jd || jd.length < 50) return context.redirect("/dashboard?error=jd_too_short");

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, status: "created" })
    .select("id")
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (sessionErr || !session) return context.redirect("/dashboard?error=session_failed");

  try {
    // Step 1: Extract constraints
    const constraints = await extractConstraints(jd);
    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "system",
      content: JSON.stringify(constraints),
    });

    // Step 2: Generate challenge
    const challenge = await generateChallenge(jd, constraints);
    await supabase.from("session_messages").insert({
      session_id: session.id,
      role: "interviewer",
      content: challenge,
    });

    // Mark session active
    await supabase.from("sessions").update({ status: "active" }).eq("id", session.id);

    return context.redirect(`/interview/${session.id}`);
  } catch {
    return context.redirect("/dashboard?error=generation_failed");
  }
};
