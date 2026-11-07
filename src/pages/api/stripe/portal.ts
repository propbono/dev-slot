import type { APIRoute } from "astro";
import * as Sentry from "@sentry/astro";
import { createClient } from "@/lib/supabase";
import { errorMessage, getStripe, toError } from "@/lib/stripe";

export const prerender = false;

const ROUTE_TAG = "stripe/portal";

function notConfigured(detail: string): Response {
  Sentry.captureMessage(`${ROUTE_TAG}: ${detail}`, { level: "error", tags: { route: ROUTE_TAG } });
  return Response.json({ error: "not_configured", detail }, { status: 503 });
}

/**
 * Create a Stripe Customer Portal session so a paid user can manage their
 * subscription (change plan, update payment method, or cancel) without us
 * handling card data. The portal itself is configured in the Stripe dashboard;
 * if it isn't enabled, Stripe returns an error that we surface as `detail`.
 */
export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return notConfigured("SUPABASE_URL/KEY is not set");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const stripe = getStripe();
  if (!stripe) return notConfigured("STRIPE_SECRET_KEY is not set");

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (roleError && roleError.code !== "PGRST116") {
    Sentry.captureException(toError(roleError), { tags: { route: ROUTE_TAG } });
    return Response.json({ error: "portal_error", detail: errorMessage(roleError) }, { status: 503 });
  }

  const customerId = (roleRow?.stripe_customer_id as string | undefined | null) ?? null;
  if (!customerId) {
    return Response.json(
      { error: "no_subscription", detail: "You don't have an active subscription to manage." },
      { status: 400 },
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${context.url.origin}/account`,
    });
    return Response.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(toError(err), { tags: { route: ROUTE_TAG } });
    return Response.json({ error: "portal_error", detail: errorMessage(err) }, { status: 502 });
  }
};
