import type { APIRoute } from "astro";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import { isPlanTier, verifyWebhook } from "@/lib/stripe";

export const prerender = false;

type ServiceSupabase = NonNullable<ReturnType<typeof createServiceClient>>;

/** Subscription statuses that mean the user has lost the paid tier. */
const DOWNGRADE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

async function downgradeToUser(supabase: ServiceSupabase, customerId: string | null): Promise<void> {
  if (!customerId) return;
  await supabase.from("user_roles").update({ role: "user" }).eq("stripe_customer_id", customerId);
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
      const tier = session.metadata?.tier;
      if (!userId || !customerId || !isPlanTier(tier)) break;

      await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: tier, stripe_customer_id: customerId }, { onConflict: "user_id" });
      break;
    }
    case "customer.subscription.deleted": {
      await downgradeToUser(supabase, customerIdOf(event.data.object.customer));
      break;
    }
    case "customer.subscription.updated": {
      if (DOWNGRADE_STATUSES.has(event.data.object.status)) {
        await downgradeToUser(supabase, customerIdOf(event.data.object.customer));
      }
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true });
};
