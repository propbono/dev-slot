import type { APIRoute } from "astro";
import { captureEvent, flush } from "@/lib/posthog";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    captureEvent({ distinctId: data.user.id, event: "login", properties: { method: "password" } });
    await flush();
  }

  return context.redirect("/new-session");
};
