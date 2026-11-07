import { MODEL_FREE, MODEL_PRO, MODEL_UNLIMITED } from "astro:env/server";

/**
 * Tier → model-slot policy. A closed, version-controlled code table mapping
 * each role to a *quality class* ("free" | "pro" | "unlimited"). The concrete
 * model id for each slot is resolved from env (with defaults) below, so ops
 * can swap a model without a deploy while the tier→slot policy stays
 * reviewable and unit-tested in code.
 */
export type Role = "user" | "pro" | "unlimited" | "admin";
export type ModelSlot = "free" | "pro" | "unlimited";

export const TIER_MODEL_SLOT: Record<Role, ModelSlot> = {
  user: "free",
  pro: "pro",
  unlimited: "unlimited",
  admin: "unlimited",
};

/**
 * Concrete DeepSeek model id per slot, read from env with code defaults. All
 * three slots stay DeepSeek for now (same provider, same key, same SDK); the
 * `unlimited` slot is expected to move to a US-hosted model id later without
 * touching this mapping or the call sites.
 */
const SLOT_MODEL_ID: Record<ModelSlot, string> = {
  free: MODEL_FREE,
  pro: MODEL_PRO,
  unlimited: MODEL_UNLIMITED,
};

/**
 * Resolve the DeepSeek model id for a role, defaulting to the free slot for
 * missing or unknown roles. Returns an id string — `src/lib/ai.ts` wraps it
 * in the DeepSeek client to produce a `LanguageModel`.
 */
export function resolveModel(role?: string | null): string {
  const slot: ModelSlot = TIER_MODEL_SLOT[role as Role] ?? "free";
  return SLOT_MODEL_ID[slot];
}
