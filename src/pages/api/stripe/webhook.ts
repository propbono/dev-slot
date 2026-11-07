import type { APIRoute } from "astro";
import * as Sentry from "@sentry/astro";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import { errorMessage, isPlanTier, toError, verifyWebhook } from "@/lib/stripe";

export const prerender = false;

const ROUTE_TAG = "stripe/webhook";

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
): Promise<unknown> {
  if (!subscriptionId) return null;
  const { error } = await supabase.from("user_roles").update({ role }).eq("stripe_subscription_id", subscriptionId);
  return error ?? null;
}

async function downgradeToUser(supabase: ServiceSupabase, subscriptionId: string | null): Promise<unknown> {
  if (!subscriptionId) return null;
  const { error } = await supabase
    .from("user_roles")
    .update({ role: "user", stripe_subscription_id: null })
    .eq("stripe_subscription_id", subscriptionId);
  return error ?? null;
}

function dbError(error: unknown): Response {
  Sentry.captureException(toError(error), { tags: { route: ROUTE_TAG } });
  return Response.json({ error: "db_error", detail: errorMessage(error) }, { status: 500 });
}

function notConfigured(detail: string): Response {
  Sentry.captureMessage(`${ROUTE_TAG}: ${detail}`, { level: "error", tags: { route: ROUTE_TAG } });
  return Response.json({ error: "not_configured", detail }, { status: 503 });
}

export const POST: APIRoute = async (context) => {
  const signature = context.request.headers.get("stripe-signature");
  const payload = await context.request.text();

  // Never touch the DB until the signature is verified — an unauthenticated
  // caller must not be able to grant themselves a paid tier.
  const verification = verifyWebhook(payload, signature);
  if (!verification.ok) {
    const status = verification.error === "not_configured" ? 503 : 400;
    Sentry.captureMessage(`${ROUTE_TAG}: ${verification.detail}`, {
      level: verification.error === "not_configured" ? "error" : "warning",
      tags: { route: ROUTE_TAG },
    });
    return Response.json({ error: verification.error, detail: verification.detail }, { status });
  }

  const supabase = createServiceClient();
  if (!supabase) return notConfigured("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY is not set");

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
      if (error) return dbError(error);

      const { error: claimError } = await supabase.from("checkout_inflight").delete().eq("user_id", userId);
      if (claimError) return dbError(claimError);
      break;
    }
    case "customer.subscription.deleted": {
      const err = await downgradeToUser(supabase, event.data.object.id);
      if (err) return dbError(err);
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      if (DOWNGRADE_STATUSES.has(subscription.status)) {
        const err = await downgradeToUser(supabase, subscription.id);
        if (err) return dbError(err);
        break;
      }
      const tier = subscription.metadata?.tier;
      if (isPlanTier(tier)) {
        const err = await updateRoleBySubscription(supabase, subscription.id, tier);
        if (err) return dbError(err);
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
};
