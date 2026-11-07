import { createClient } from "./supabase";
import type { Role } from "./model-tier";

type Supabase = NonNullable<ReturnType<typeof createClient>>;

export type TierRole = "user" | "pro" | "unlimited" | "admin";

/** Human-readable plan names used across the pricing, account, and nav UI. */
export const TIER_LABELS: Record<TierRole, string> = {
  user: "Free",
  pro: "Pro",
  unlimited: "Unlimited",
  admin: "Admin",
};

/** Ordering used to decide whether a target plan is an upgrade. */
export const TIER_RANK: Record<TierRole, number> = {
  user: 0,
  pro: 1,
  unlimited: 2,
  admin: 3,
};

type TierLimits = {
  interviewsPerMonth: number | null; // null = unlimited
  turnsPerChallenge: number | null;
  challengesPerSession: number | null;
};

const TIERS: Record<TierRole, TierLimits> = {
  user: { interviewsPerMonth: 1, turnsPerChallenge: 3, challengesPerSession: 1 },
  pro: { interviewsPerMonth: 5, turnsPerChallenge: null, challengesPerSession: 5 },
  unlimited: { interviewsPerMonth: null, turnsPerChallenge: null, challengesPerSession: null },
  admin: { interviewsPerMonth: null, turnsPerChallenge: null, challengesPerSession: null },
};

/** Resolve the authenticated user's subscription role (defaults to `user`). */
export async function getRole(supabase: Supabase, userId: string): Promise<Role> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).single();

  return (data?.role as Role | undefined) ?? "user";
}

async function getTier(supabase: Supabase, userId: string): Promise<TierLimits> {
  const role = await getRole(supabase, userId);
  return TIERS[role] ?? TIERS.user;
}

async function ensureCounters(supabase: Supabase, userId: string) {
  const { data } = await supabase
    .from("usage_counters")
    .select("interviews_this_month, billing_cycle_start")
    .eq("user_id", userId)
    .single();

  if (!data) {
    // First time — create counter row
    await supabase.from("usage_counters").insert({ user_id: userId });
    return { interviews_this_month: 0, billing_cycle_start: new Date().toISOString() };
  }

  const cycleStart = new Date(data.billing_cycle_start);
  const now = new Date();
  const daysSince = (now.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince >= 30) {
    // Reset counter for new cycle
    await supabase
      .from("usage_counters")
      .update({
        interviews_this_month: 0,
        billing_cycle_start: now.toISOString(),
      })
      .eq("user_id", userId);
    return { interviews_this_month: 0, billing_cycle_start: now.toISOString() };
  }

  return { interviews_this_month: data.interviews_this_month, billing_cycle_start: data.billing_cycle_start };
}

export async function checkInterviewLimit(
  supabase: Supabase,
  userId: string,
): Promise<{ allowed: boolean; message?: string }> {
  const tier = await getTier(supabase, userId);
  if (tier.interviewsPerMonth === null) return { allowed: true };

  const counters = await ensureCounters(supabase, userId);
  if (counters.interviews_this_month >= tier.interviewsPerMonth) {
    return { allowed: false, message: "upgrade_required" };
  }

  return { allowed: true };
}

export async function incrementInterviewCounter(supabase: Supabase, userId: string) {
  const { data } = await supabase.from("usage_counters").select("interviews_this_month").eq("user_id", userId).single();

  const current: number = data?.interviews_this_month ?? 0;
  await supabase
    .from("usage_counters")
    .upsert({ user_id: userId, interviews_this_month: current + 1 }, { onConflict: "user_id" });
}

export async function checkTurnLimit(
  supabase: Supabase,
  userId: string,
  challengeId: string,
): Promise<{ allowed: boolean; message?: string }> {
  const tier = await getTier(supabase, userId);
  if (tier.turnsPerChallenge === null) return { allowed: true };

  const { count } = await supabase
    .from("session_messages")
    .select("*", { count: "exact", head: true })
    .eq("challenge_id", challengeId)
    .eq("role", "user")
    .eq("status", "committed");

  if (count && count >= tier.turnsPerChallenge) {
    return { allowed: false, message: "upgrade_required" };
  }

  return { allowed: true };
}

export async function checkChallengeLimit(
  supabase: Supabase,
  userId: string,
  sessionId: string,
): Promise<{ allowed: boolean; message?: string }> {
  const tier = await getTier(supabase, userId);
  if (tier.challengesPerSession === null) return { allowed: true };

  const { count } = await supabase
    .from("challenges")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (count && count >= tier.challengesPerSession) {
    return { allowed: false, message: "upgrade_required" };
  }

  return { allowed: true };
}
