import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return context.redirect("/dashboard?error=not_configured");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  const form = await context.request.formData();
  const sessionId = (form.get("sessionId") as string)?.trim();
  if (!sessionId) return context.redirect("/dashboard?error=missing_session");

  // Verify session ownership
  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return context.redirect("/dashboard?error=session_not_found");

  // Only end if active
  if (session.status === "active") {
    await supabase
      .from("sessions")
      .update({ status: "completed" })
      .eq("id", sessionId);
  }

  return context.redirect(`/interview/${sessionId}`);
};
