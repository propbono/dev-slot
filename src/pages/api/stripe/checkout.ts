import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase";
import { getPriceId, getStripe, isPlanTier, PLANS } from "@/lib/stripe";

export const prerender = false;

/** Statuses for which a stored subscription is still billed and changeable. */
const CHANGEABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

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
      { idempotencyKey: `${user.id}:${tier}` },
    );
  } catch {
    return Response.json({ error: "checkout_error" }, { status: 502 });
  }

  return Response.json({ url: session.url });
};
