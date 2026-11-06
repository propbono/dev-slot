import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import { isPlanTier, verifyWebhook } from "@/lib/stripe";

export const prerender = false;

type ServiceSupabase = NonNullable<ReturnType<typeof createServiceClient>>;

/** Terminal subscription statuses that mean the user has permanently lost the paid tier. */
const DOWNGRADE_STATUSES = new Set(["canceled", "incomplete_expired"]);

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

function subscriptionIdOf(subscription: string | Stripe.Subscription | null | undefined): string | null {
  if (typeof subscription === "string") return subscription;
  return subscription?.id ?? null;
}

async function updateRoleBySubscription(
  supabase: ServiceSupabase,
  subscriptionId: string | null,
  role: "user" | "pro" | "unlimited",
): Promise<boolean> {
  if (!subscriptionId) return true;
  const { error } = await supabase.from("user_roles").update({ role }).eq("stripe_subscription_id", subscriptionId);
  return !error;
}

async function downgradeToUser(supabase: ServiceSupabase, subscriptionId: string | null): Promise<boolean> {
  if (!subscriptionId) return true;
  const { error } = await supabase
    .from("user_roles")
    .update({ role: "user", stripe_subscription_id: null })
    .eq("stripe_subscription_id", subscriptionId);
  return !error;
}

export const POST: APIRoute = async (context) => {
  const signature = context.request.headers.get("stripe-signature");
  const payload = await context.request.text();

  // Never touch the DB until the signature is verified — an unauthenticated
  // caller must not be able to grant themselves a paid tier.
  const verification = verifyWebhook(payload, signature);
  if (!verification.ok) {
    const status = verification.error === "not_configured" ? 503 : 400;
    return Response.json({ error: verification.error }, { status });
  }

  const supabase = createServiceClient();
  if (!supabase) return Response.json({ error: "not_configured" }, { status: 503 });

  const event = verification.event;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") break;
      const userId = session.client_reference_id;
      const customerId = customerIdOf(session.customer);
      const subscriptionId = subscriptionIdOf(session.subscription);
      const tier = session.metadata?.tier;
      if (!userId || !customerId || !subscriptionId || !isPlanTier(tier)) break;

      const { error } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: tier, stripe_customer_id: customerId, stripe_subscription_id: subscriptionId },
          { onConflict: "user_id" },
        );
      if (error) return Response.json({ error: "db_error" }, { status: 500 });

      const { error: claimError } = await supabase.from("checkout_inflight").delete().eq("user_id", userId);
      if (claimError) return Response.json({ error: "db_error" }, { status: 500 });
      break;
    }
    case "customer.subscription.deleted": {
      const ok = await downgradeToUser(supabase, event.data.object.id);
      if (!ok) return Response.json({ error: "db_error" }, { status: 500 });
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      if (DOWNGRADE_STATUSES.has(subscription.status)) {
        const ok = await downgradeToUser(supabase, subscription.id);
        if (!ok) return Response.json({ error: "db_error" }, { status: 500 });
        break;
      }
      const tier = subscription.metadata?.tier;
      if (isPlanTier(tier)) {
        const ok = await updateRoleBySubscription(supabase, subscription.id, tier);
        if (!ok) return Response.json({ error: "db_error" }, { status: 500 });
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
};
