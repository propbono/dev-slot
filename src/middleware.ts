import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { TierRole } from "@/lib/tiers";

const PROTECTED_ROUTES = ["/new-session", "/account"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    // Resolve the current tier once per request so the nav badge and pricing
    // grid can show the current plan without each page repeating the lookup.
    let role: TierRole | null = null;
    if (user) {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
      role = (data?.role as TierRole | undefined) ?? "user";
    }
    context.locals.role = role;
  } else {
    context.locals.user = null;
    context.locals.role = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
