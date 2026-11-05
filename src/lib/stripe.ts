import Stripe from "stripe";
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from "astro:env/server";

export type PlanTier = "pro" | "unlimited";

export type Plan = {
  name: string;
  /** Price in USD cents. Locked by product spec: pro $10/mo, unlimited $15/mo. */
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
