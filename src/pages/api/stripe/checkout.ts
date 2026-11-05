import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { getStripe, isPlanTier, PLANS } from "@/lib/stripe";

export const prerender = false;

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

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.unitAmount,
          recurring: { interval: "month" },
          product_data: { name: plan.name },
        },
      },
    ],
    success_url: `${origin}/new-session?checkout=success`,
    cancel_url: `${origin}/new-session?checkout=cancelled`,
    metadata: { tier, userId: user.id },
  });

  return Response.json({ url: session.url });
};
