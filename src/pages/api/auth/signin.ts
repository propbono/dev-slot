import type { APIRoute } from "astro";
import { captureEvent, flush } from "@/lib/posthog";
import { createClient, isEmailConfirmed, CONFIRM_EMAIL_PATH } from "@/lib/supabase";

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
    // When Supabase has "Confirm email" enabled it rejects unconfirmed sign-ins
    // with this code before creating a session.
    if (error.code === "email_not_confirmed") {
      return context.redirect(`${CONFIRM_EMAIL_PATH}?email=${encodeURIComponent(email)}`);
    }
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
  }

  // Even when the project allows unconfirmed sign-ins, an account whose email
  // is still pending confirmation must not enter the app. Drop the freshly
  // created session and send the user to the confirmation screen with a resend.
  if (data.user && !isEmailConfirmed(data.user)) {
    await supabase.auth.signOut();
    return context.redirect(`${CONFIRM_EMAIL_PATH}?email=${encodeURIComponent(email)}`);
  }

  if (data.user) {
    captureEvent({ distinctId: data.user.id, event: "login", properties: { method: "password" } });
    await flush();
  }

  return context.redirect("/new-session");
};
