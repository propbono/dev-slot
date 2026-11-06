import Stripe from "stripe";
import {
  STRIPE_PRICE_ID_PRO,
  STRIPE_PRICE_ID_UNLIMITED,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
} from "astro:env/server";

export type PlanTier = "pro" | "unlimited";

export type Plan = {
  name: string;
  /** Price in CAD cents. Locked by product spec: pro CA$10/mo, unlimited CA$15/mo. */
  unitAmount: number;
};

/**
 * Billing metadata for the sellable tiers. `src/lib/tiers.ts` owns the usage
 * limits; this module owns the Stripe-facing price points. Do not change the
 * price points without a product decision.
 */
export const PLANS: Record<PlanTier, Plan> = {
  pro: { name: "DevSlot Pro", unitAmount: 1000 },
  unlimited: { name: "DevSlot Unlimited", unitAmount: 1500 },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "pro" || value === "unlimited";
}

/**
 * Stable Stripe Price ID used to change an existing subscription's plan. The
 * initial checkout uses inline `price_data`, but `subscriptions.update` cannot
 * reuse that, so it needs a Price ID created in the Stripe dashboard (in CAD). Null when
 * not configured (which only blocks plan changes, never first-time checkout).
 */
export function getPriceId(tier: PlanTier): string | null {
  const priceId = tier === "pro" ? STRIPE_PRICE_ID_PRO : STRIPE_PRICE_ID_UNLIMITED;
  if (!priceId) return null;
  return priceId;
}

/** Stripe API client for the checkout endpoint. Null when not configured. */
export function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY);
}

export type WebhookVerification =
  | { ok: true; event: Stripe.Event }
  | { ok: false; error: "not_configured" | "invalid_signature" };

/**
 * Verify a Stripe webhook payload against its `stripe-signature` header using
 * the webhook endpoint secret. Returns the constructed event only after the
 * HMAC signature (and recency tolerance) checks pass — never construct an
 * event from an unverified payload.
 */
export function verifyWebhook(payload: string, signature: string | null): WebhookVerification {
  if (!STRIPE_WEBHOOK_SECRET) return { ok: false, error: "not_configured" };
  if (!signature) return { ok: false, error: "invalid_signature" };
  try {
    const event = Stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
    return { ok: true, event };
  } catch {
    return { ok: false, error: "invalid_signature" };
  }
}
