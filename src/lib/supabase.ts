import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

/** Where unconfirmed users are redirected until they verify their email. */
export const CONFIRM_EMAIL_PATH = "/auth/confirm-email";

/**
 * Whether the user's email has been confirmed. Supabase exposes the timestamp
 * under `email_confirmed_at` (and the legacy `confirmed_at` alias); it stays
 * unset until the user clicks the confirmation link. The project may still
 * allow unconfirmed sign-ins (the Supabase "Confirm email" dashboard toggle is
 * off), so every protected surface must gate on this rather than on the mere
 * presence of a session.
 */
export function isEmailConfirmed(user: User | null | undefined): boolean {
  return Boolean(user?.email_confirmed_at ?? user?.confirmed_at);
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Privileged client for server-to-server writes that must bypass RLS (e.g. the
 * Stripe webhook, which has no user session). Uses the service role key and
 * never persists an auth session. Keep this out of request-scoped code paths.
 */
export function createServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
