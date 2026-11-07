import type { APIRoute } from "astro";
import { createClient, CONFIRM_EMAIL_PATH } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = (form.get("email") as string | null)?.trim() ?? "";

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${CONFIRM_EMAIL_PATH}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  if (!email) {
    return context.redirect(
      `${CONFIRM_EMAIL_PATH}?error=${encodeURIComponent("Enter your email address to resend the confirmation link.")}`,
    );
  }

  const { error } = await supabase.auth.resend({ type: "signup", email });

  if (error) {
    return context.redirect(`${CONFIRM_EMAIL_PATH}?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect(`${CONFIRM_EMAIL_PATH}?resent=1&email=${encodeURIComponent(email)}`);
};
