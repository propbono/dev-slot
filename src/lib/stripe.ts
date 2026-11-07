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
  pro: { name: "Archdrill Pro", unitAmount: 1000 },
  unlimited: { name: "Archdrill Unlimited", unitAmount: 1500 },
};

export function isPlanTier(value: unknown): value is PlanTier {
  return value === "pro" || value === "unlimited";
}

/**
 * Redact PII from a message before it reaches Sentry or the client `detail`
 * field. Stripe already masks card numbers in its own error messages, but a
 * thrown error can still echo the customer's own email back via
 * `customer_email`. This removes email addresses and any 13-19 digit run
 * (card-number shaped) as defense-in-depth.
 */
function sanitize(message: string): string {
  return message
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/\d{13,19}/g, "[redacted]");
}

/**
 * Extract a safe, human-readable message from an arbitrary thrown value.
 * Only ever returns `message`/`code` strings, sanitized so no PII (emails or
 * card data) reaches Sentry or the client. Supabase errors never expose
 * secrets (`.details`/`.hint`, which can carry row data, are deliberately
 * skipped).
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return sanitize(err.message);
  if (typeof err === "string") return sanitize(err);
  if (err && typeof err === "object") {
    const record = err as { message?: unknown; code?: unknown };
    if (typeof record.message === "string" && record.message) return sanitize(record.message);
    if (typeof record.code === "string" && record.code) return sanitize(record.code);
  }
  return "Unknown error";
}

/** Normalize an arbitrary thrown value to an `Error` for Sentry capture,
 * with the same PII redaction applied to its message. */
export function toError(err: unknown): Error {
  return err instanceof Error ? new Error(sanitize(err.message)) : new Error(errorMessage(err));
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
  | { ok: false; error: "not_configured" | "invalid_signature"; detail: string };

/**
 * Verify a Stripe webhook payload against its `stripe-signature` header using
 * the webhook endpoint secret. Returns the constructed event only after the
 * HMAC signature (and recency tolerance) checks pass — never construct an
 * event from an unverified payload.
 */
export function verifyWebhook(payload: string, signature: string | null): WebhookVerification {
  if (!STRIPE_WEBHOOK_SECRET) {
    return { ok: false, error: "not_configured", detail: "STRIPE_WEBHOOK_SECRET is not set" };
  }
  if (!signature) {
    return { ok: false, error: "invalid_signature", detail: "Missing stripe-signature header" };
  }
  try {
    const event = Stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
    return { ok: true, event };
  } catch (err) {
    return {
      ok: false,
      error: "invalid_signature",
      detail: `Webhook signature verification failed: ${errorMessage(err)}`,
    };
  }
}
