import { PLANS } from "./stripe";
import { TIER_LABELS, TIER_RANK, type TierRole } from "./tiers";

/** Sellable plans shown in the pricing grid and account page. */
export type PlanTierId = "user" | "pro" | "unlimited";

export type PlanState = "available" | "current" | "upgrade" | "downgrade";

export type PlanCard = {
  tier: PlanTierId;
  name: string;
  price: string;
  features: string[];
};

/**
 * Presentation metadata for the pricing grid. Feature strings and price labels
 * live here (not in each page) so the landing grid, pricing page, and account
 * page never drift apart. Price points come from `src/lib/stripe.ts`.
 */
export const PLAN_CARDS: PlanCard[] = [
  {
    tier: "user",
    name: TIER_LABELS.user,
    price: "$0",
    features: ["1 interview per month", "3 turns per challenge", "1 challenge per session"],
  },
  {
    tier: "pro",
    name: TIER_LABELS.pro,
    price: `CA$${PLANS.pro.unitAmount / 100}`,
    features: ["5 interviews per month", "Unlimited turns per challenge", "5 challenges per session"],
  },
  {
    tier: "unlimited",
    name: TIER_LABELS.unlimited,
    price: `CA$${PLANS.unlimited.unitAmount / 100}`,
    features: ["Unlimited interviews", "Unlimited turns", "Unlimited challenges"],
  },
];

/**
 * Classify a pricing-grid button for the signed-in user: the current plan is
 * disabled, a higher tier is an upgrade, and a lower tier is a downgrade.
 * Signed-out visitors get the plain "available" state. `admin` is treated as
 * `unlimited` for display so it never renders as a downgrade target.
 */
export function planState(currentRole: TierRole | null, tier: PlanTierId): PlanState {
  if (!currentRole) return "available";
  const current = currentRole === "admin" ? "unlimited" : currentRole;
  if (current === tier) return "current";
  return TIER_RANK[tier] > TIER_RANK[current] ? "upgrade" : "downgrade";
}

/** Look up a plan card, failing loudly if a tier id is ever out of sync. */
export function planFor(tier: PlanTierId): PlanCard {
  const plan = PLAN_CARDS.find((card) => card.tier === tier);
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
  return plan;
}

/** Feature list for a role, used by the account page to describe the current plan. */
export function featuresFor(role: TierRole): string[] {
  const tier: PlanTierId = role === "admin" ? "unlimited" : role;
  return planFor(tier).features;
}
