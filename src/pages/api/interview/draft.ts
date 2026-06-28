import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return new Response("Not configured", { status: 500 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const form = await context.request.formData();
  const sessionId = (form.get("sessionId") as string)?.trim();
  const content = (form.get("content") as string)?.trim();

  if (!sessionId || !content) {
    return new Response("Missing fields", { status: 400 });
  }

  // Verify session belongs to user
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) return new Response("Session not found", { status: 404 });

  // Upsert draft: if a draft exists, update it; otherwise insert
  const { data: existing } = await supabase
    .from("session_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .eq("status", "draft")
    .single();

  if (existing) {
    await supabase
      .from("session_messages")
      .update({ content, metadata: { draft: true } })
      .eq("id", existing.id);
  } else {
    await supabase.from("session_messages").insert({
      session_id: sessionId,
      role: "user",
      content,
      status: "draft",
      metadata: { draft: true },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
