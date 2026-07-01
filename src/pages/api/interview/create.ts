import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/new-session?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const jd = (form.get("jd") as string | null)?.trim();
  if (!jd || jd.length < 50) return context.redirect("/new-session?error=jd_too_short");

  // Create session
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ user_id: user.id, status: "created" })
    .select("id")
    .single();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (sessionErr || !session) return context.redirect("/new-session?error=session_failed");

  // Store JD as a pending system message — the generate endpoint reads it
  await supabase.from("session_messages").insert({
    session_id: session.id,
    role: "system",
    content: JSON.stringify({ raw_jd: jd, status: "pending" }),
    status: "committed",
  });

  return context.redirect(`/interview/${session.id}`);
};
