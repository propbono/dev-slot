import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase";
import { getPriceId, getStripe, isPlanTier, PLANS, type PlanTier } from "@/lib/stripe";

export const prerender = false;

/** Statuses for which a stored subscription is still billed and changeable. */
const CHANGEABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

type Supabase = NonNullable<ReturnType<typeof createClient>>;

/** How long an un-released checkout claim may block a re-claim before it is
 * treated as abandoned and reclaimed. */
const CHECKOUT_CLAIM_STALE_MS = 5 * 60 * 1000;

type ClaimResult = "claimed" | "in_flight" | "error";

async function releaseCheckoutClaim(supabase: Supabase, userId: string): Promise<void> {
  await supabase.from("checkout_inflight").delete().eq("user_id", userId);
}

/**
 * Atomically claim the per-user checkout slot so two concurrent checkout
 * requests (same or different tier) cannot create two Checkout Sessions.
 */
async function claimCheckout(supabase: Supabase, userId: string, tier: PlanTier): Promise<ClaimResult> {
  const { error: insertError } = await supabase
    .from("checkout_inflight")
    .insert({ user_id: userId, tier });

  if (!insertError) return "claimed";
  if (insertError.code !== "23505") return "error";

  const { data, error: readError } = await supabase
    .from("checkout_inflight")
    .select("claimed_at")
    .eq("user_id", userId)
    .single();

  if (readError && readError.code !== "PGRST116") return "error";

  if (data) {
    const claimedAt = Date.parse(String(data.claimed_at));
    const stale = !Number.isFinite(claimedAt) || Date.now() - claimedAt > CHECKOUT_CLAIM_STALE_MS;
    if (!stale) return "in_flight";
  }

  await releaseCheckoutClaim(supabase, userId);
  const { error: retryError } = await supabase
    .from("checkout_inflight")
    .insert({ user_id: userId, tier });

  if (!retryError) return "claimed";
  if (retryError.code === "23505") return "in_flight";
  return "error";
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return Response.json({ error: "not_configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "not_configured" }, { status: 503 });

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
    return Response.json({ error: "subscription_error" }, { status: 503 });
  }

  const existingSubscriptionId = (roleRow?.stripe_subscription_id as string | undefined | null) ?? null;

  if (existingSubscriptionId) {
    let subscription: Stripe.Subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(existingSubscriptionId);
    } catch {
      return Response.json({ error: "subscription_error" }, { status: 502 });
    }

    if (CHANGEABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      const priceId = getPriceId(tier);
      if (!priceId) return Response.json({ error: "not_configured" }, { status: 503 });

      const item = subscription.items.data[0];
      if (!item) return Response.json({ error: "subscription_error" }, { status: 502 });

      try {
        await stripe.subscriptions.update(existingSubscriptionId, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { tier },
        });
      } catch {
        return Response.json({ error: "subscription_error" }, { status: 502 });
      }

      return Response.json({ url: null });
    }
  }

  const claim = await claimCheckout(supabase, user.id, tier);
  if (claim === "in_flight") {
    return Response.json({ error: "checkout_in_flight" }, { status: 409 });
  }
  if (claim === "error") {
    return Response.json({ error: "checkout_error" }, { status: 503 });
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
        success_url: `${origin}/new-session?checkout=success`,
        cancel_url: `${origin}/new-session?checkout=cancelled`,
        metadata: { tier, userId: user.id },
        subscription_data: { metadata: { tier } },
      },
      { idempotencyKey: `${user.id}:${randomUUID()}` },
    );
  } catch {
    await releaseCheckoutClaim(supabase, user.id);
    return Response.json({ error: "checkout_error" }, { status: 502 });
  }

  return Response.json({ url: session.url });
};
