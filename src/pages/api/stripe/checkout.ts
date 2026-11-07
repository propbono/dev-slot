import type { APIRoute } from "astro";
import * as Sentry from "@sentry/astro";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createClient, isEmailConfirmed } from "@/lib/supabase";
import { errorMessage, getPriceId, getStripe, isPlanTier, PLANS, toError, type PlanTier } from "@/lib/stripe";

export const prerender = false;

const ROUTE_TAG = "stripe/checkout";

/** Statuses for which a stored subscription is still billed and changeable. */
const CHANGEABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/** How long an un-released checkout claim may block a re-claim before it is
 * treated as abandoned and reclaimed. */
const CHECKOUT_CLAIM_STALE_MS = 5 * 60 * 1000;

type ClaimResult = { status: "claimed" } | { status: "in_flight" } | { status: "error"; error: unknown };

async function releaseCheckoutClaim(supabase: Supabase, userId: string): Promise<void> {
  await supabase.from("checkout_inflight").delete().eq("user_id", userId);
}

/**
 * Atomically claim the per-user checkout slot so two concurrent checkout
 * requests (same or different tier) cannot create two Checkout Sessions.
 */
async function claimCheckout(supabase: Supabase, userId: string, tier: PlanTier): Promise<ClaimResult> {
  const { error: insertError } = await supabase.from("checkout_inflight").insert({ user_id: userId, tier });

  if (!insertError) return { status: "claimed" };
  if (insertError.code !== "23505") return { status: "error", error: insertError };

  const staleIso = new Date(Date.now() - CHECKOUT_CLAIM_STALE_MS).toISOString();
  const { data, error: reclaimError } = await supabase
    .from("checkout_inflight")
    .update({ tier, claimed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .lt("claimed_at", staleIso)
    .select("user_id");

  if (reclaimError) return { status: "error", error: reclaimError };

  return Array.isArray(data) && data.length === 1 ? { status: "claimed" } : { status: "in_flight" };
}

function notConfigured(detail: string): Response {
  Sentry.captureMessage(`${ROUTE_TAG}: ${detail}`, { level: "error", tags: { route: ROUTE_TAG } });
  return Response.json({ error: "not_configured", detail }, { status: 503 });
}

function captureError(error: unknown): string {
  Sentry.captureException(toError(error), { tags: { route: ROUTE_TAG } });
  return errorMessage(error);
}

function captureFailure(message: string): string {
  Sentry.captureMessage(`${ROUTE_TAG}: ${message}`, { level: "error", tags: { route: ROUTE_TAG } });
  return message;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return notConfigured("SUPABASE_URL/KEY is not set");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The 401/400 branches below (unauthorized, invalid_request, invalid_tier)
  // are intentional client-side validation/control-flow responses, excluded
  // from Sentry capture to avoid alert noise.
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isEmailConfirmed(user)) return Response.json({ error: "email_not_confirmed" }, { status: 403 });

  const stripe = getStripe();
  if (!stripe) return notConfigured("STRIPE_SECRET_KEY is not set");

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const tier = (body as { tier?: unknown } | null)?.tier;
  if (!isPlanTier(tier)) return Response.json({ error: "invalid_tier" }, { status: 400 });

  const plan = PLANS[tier];
  const origin = context.url.origin;

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .single();

  if (roleError && roleError.code !== "PGRST116") {
    return Response.json({ error: "subscription_error", detail: captureError(roleError) }, { status: 503 });
  }

  const existingSubscriptionId = (roleRow?.stripe_subscription_id as string | undefined | null) ?? null;

  if (existingSubscriptionId) {
    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
    } catch (err) {
      return Response.json({ error: "subscription_error", detail: captureError(err) }, { status: 502 });
    }

    if (CHANGEABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      const priceId = getPriceId(tier);
      if (!priceId) return notConfigured(`STRIPE_PRICE_ID_${tier.toUpperCase()} is not set`);

      const item = subscription.items.data[0];
      if (!item) {
        const detail = captureFailure("Existing subscription has no line items");
        return Response.json({ error: "subscription_error", detail }, { status: 502 });
      }

      try {
        await stripe.subscriptions.update(existingSubscriptionId, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { tier },
        });
      } catch (err) {
        return Response.json({ error: "subscription_error", detail: captureError(err) }, { status: 502 });
      }

      return Response.json({ url: null });
    }
  }

  const claim = await claimCheckout(supabase, user.id, tier);
  if (claim.status === "in_flight") {
    Sentry.captureMessage(`${ROUTE_TAG}: checkout_in_flight`, { level: "warning", tags: { route: ROUTE_TAG } });
    return Response.json({ error: "checkout_in_flight" }, { status: 409 });
  }
  if (claim.status === "error") {
    return Response.json({ error: "checkout_error", detail: captureError(claim.error) }, { status: 503 });
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: user.id,
        customer_email: user.email ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "cad",
              unit_amount: plan.unitAmount,
              recurring: { interval: "month" },
              product_data: { name: plan.name },
            },
          },
        ],
        success_url: `${origin}/account?checkout=success`,
        cancel_url: `${origin}/account?checkout=cancelled`,
        metadata: { tier, userId: user.id },
        subscription_data: { metadata: { tier } },
      },
      { idempotencyKey: `${user.id}:${randomUUID()}` },
    );
  } catch (err) {
    await releaseCheckoutClaim(supabase, user.id);
    return Response.json({ error: "checkout_error", detail: captureError(err) }, { status: 502 });
  }

  return Response.json({ url: session.url });
};
