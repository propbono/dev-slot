import type { APIRoute } from "astro";
import { captureEvent, flush } from "@/lib/posthog";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  const userId = data.user?.id;
  if (userId) {
    // No session on signUp means Supabase requires email confirmation before
    // the account can sign in.
    captureEvent({
      distinctId: userId,
      event: "sign_up",
      properties: { method: "password", requires_email_confirmation: data.session === null },
    });
    await flush();
  }

  return context.redirect("/auth/confirm-email");
};
